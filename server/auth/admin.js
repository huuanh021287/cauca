// Xác thực trang admin: mật khẩu chỉ lưu dưới dạng băm scrypt có muối; phiên đăng nhập là token ngẫu nhiên
// trong cookie HttpOnly; đăng nhập sai nhiều lần sẽ bị khoá tạm theo IP.
import crypto from 'node:crypto';
import fs from 'node:fs';

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const SESSION_MS = 12 * 60 * 60 * 1000;
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;
export const COOKIE = 'cauca_admin';

export function hashPassword(password, salt = crypto.randomBytes(16)) {
  const hash = crypto.scryptSync(String(password), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = crypto.scryptSync(String(password), Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(N), r: Number(r), p: Number(p),
  });
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

// So sánh chuỗi cố định thời gian (băm trước để độ dài luôn bằng nhau).
function sameText(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

// Đọc { username, password_hash } từ file; file thiếu hoặc hỏng thì trả về null (admin bị khoá).
export function loadAdminAccount(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (typeof data.username !== 'string' || typeof data.passwordHash !== 'string') return null;
    return data;
  } catch {
    return null;
  }
}

export function createAdminAuth(account, { now = () => Date.now(), token = () => crypto.randomBytes(32).toString('base64url') } = {}) {
  const sessions = new Map(); // token -> hết hạn (ms)
  const fails = new Map(); // ip -> { count, lockedUntil }

  function login(ip, username, password) {
    const t = now();
    const f = fails.get(ip) ?? { count: 0, lockedUntil: 0 };
    if (f.lockedUntil > t) return { ok: false, status: 429, retryAfterSec: Math.ceil((f.lockedUntil - t) / 1000) };
    if (!account) return { ok: false, status: 503 };
    const good = sameText(username, account.username) && verifyPassword(password, account.passwordHash);
    if (!good) {
      f.count += 1;
      if (f.count >= MAX_FAILS) { f.lockedUntil = t + LOCK_MS; f.count = 0; }
      fails.set(ip, f);
      return { ok: false, status: 401 };
    }
    fails.delete(ip);
    const tok = token();
    sessions.set(tok, t + SESSION_MS);
    return { ok: true, token: tok };
  }

  function valid(tok) {
    if (!tok) return false;
    const exp = sessions.get(tok);
    if (exp === undefined) return false;
    if (exp <= now()) { sessions.delete(tok); return false; }
    return true;
  }

  function logout(tok) { sessions.delete(tok); }

  return { login, valid, logout, configured: Boolean(account) };
}

// Lấy token từ header Cookie.
export function tokenFromCookie(header) {
  if (typeof header !== 'string') return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === COOKIE) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export function sessionCookie(tok) {
  return `${COOKIE}=${encodeURIComponent(tok)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MS / 1000}`;
}

export function clearCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}
