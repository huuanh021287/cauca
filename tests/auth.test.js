import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, createAdminAuth, tokenFromCookie, sessionCookie } from '../server/auth/admin.js';

const PW = 'mat-khau-thu-nghiem-1'; // mật khẩu giả chỉ dùng trong test

test('băm scrypt có muối: không lưu văn bản thô, đúng mật khẩu mới qua', () => {
  const h = hashPassword(PW);
  assert.ok(!h.includes(PW));
  assert.ok(h.startsWith('scrypt$'));
  assert.notEqual(hashPassword(PW), h, 'muối phải ngẫu nhiên');
  assert.equal(verifyPassword(PW, h), true);
  assert.equal(verifyPassword(PW + 'x', h), false);
  assert.equal(verifyPassword(PW, 'không_phải_hash'), false);
});

test('phiên hết hạn sau 12 giờ; đăng xuất thu hồi ngay', () => {
  let t = 0;
  const auth = createAdminAuth({ username: 'Admin', passwordHash: hashPassword(PW) }, { now: () => t, token: () => 'tok' });
  assert.equal(auth.login('1.2.3.4', 'Admin', PW).ok, true);
  assert.equal(auth.valid('tok'), true);
  t += 12 * 60 * 60 * 1000;
  assert.equal(auth.valid('tok'), false);
  auth.login('1.2.3.4', 'Admin', PW);
  auth.logout('tok');
  assert.equal(auth.valid('tok'), false);
});

test('khoá tạm 15 phút sau 5 lần sai; đăng nhập đúng sau khi hết khoá', () => {
  let t = 0;
  const auth = createAdminAuth({ username: 'Admin', passwordHash: hashPassword(PW) }, { now: () => t });
  for (let i = 0; i < 5; i++) assert.equal(auth.login('9.9.9.9', 'Admin', 'x').status, 401);
  const locked = auth.login('9.9.9.9', 'Admin', PW);
  assert.equal(locked.status, 429);
  assert.equal(locked.retryAfterSec, 900);
  t += 15 * 60 * 1000 + 1;
  assert.equal(auth.login('9.9.9.9', 'Admin', PW).ok, true);
});

test('chưa có tài khoản thì không đăng nhập được (503)', () => {
  const auth = createAdminAuth(null);
  assert.equal(auth.configured, false);
  assert.equal(auth.login('1.1.1.1', 'Admin', 'x').status, 503);
});

test('đọc token từ cookie và tạo cookie an toàn', () => {
  assert.equal(tokenFromCookie('a=1; cauca_admin=abc%2Bdef; b=2'), 'abc+def');
  assert.equal(tokenFromCookie('a=1'), null);
  assert.equal(tokenFromCookie(undefined), null);
  const c = sessionCookie('tok');
  assert.match(c, /HttpOnly/);
  assert.match(c, /SameSite=Strict/);
});
