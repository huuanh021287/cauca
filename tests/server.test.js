import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { WebSocket } from 'ws';
import { loadConfig } from '../server/config/loadConfig.js';
import { startServer } from '../server/app.js';
import { hashPassword } from '../server/auth/admin.js';

export const ADMIN_USER = 'Admin';
export const ADMIN_PASS = 'mat-khau-thu-nghiem-1'; // chỉ dùng trong test; không phải mật khẩu thật

// Mỗi bài test có thư mục riêng với tài khoản admin thử nghiệm (mật khẩu chỉ lưu dạng băm).
async function withServer(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cauca-'));
  fs.writeFileSync(path.join(dir, 'admin.json'), JSON.stringify({ username: ADMIN_USER, passwordHash: hashPassword(ADMIN_PASS) }));
  const app = await startServer(loadConfig(), { port: 0, dataFile: path.join(dir, 'players.json') });
  try { await fn(app); } finally { await app.close(); }
}

// Đăng nhập admin qua HTTP, trả về cookie phiên.
export async function adminCookie(app) {
  const r = await fetch(`http://localhost:${app.port}/admin/api/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
  });
  assert.equal(r.status, 200);
  return r.headers.get('set-cookie').split(';')[0];
}

// Mở WS, gom tin nhắn; waitFor(pred) đợi tin khớp (tối đa 3s).
// Mặc định kết nối với phiên admin; truyền { admin: false } để kết nối như người xem.
async function client(app, opts = {}) {
  const { admin = true, ...rest } = opts;
  const headers = { ...(rest.headers ?? {}) };
  if (admin) headers.Cookie = await adminCookie(app);
  const ws = new WebSocket(`ws://localhost:${app.port}/ws`, { ...rest, headers });
  const msgs = [];
  const waiters = [];
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    msgs.push(m);
    waiters.slice().forEach((w) => w.check());
  });
  await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
  const waitFor = (pred) => new Promise((resolve, reject) => {
    const w = {
      check: () => { const m = msgs.find(pred); if (m) { clearTimeout(t); waiters.splice(waiters.indexOf(w), 1); resolve(m); } },
    };
    const t = setTimeout(() => reject(new Error('quá hạn chờ tin nhắn')), 3000);
    waiters.push(w);
    w.check();
  });
  const send = (o) => ws.send(typeof o === 'string' ? o : JSON.stringify(o));
  return { ws, msgs, waitFor, send };
}
const seatedCount = (m) => m.t === 'snapshot' && m.data.seats.filter(Boolean).length;

test('server serves config, snapshot and reacts to sim join', () => withServer(async (app) => {
  const base = `http://localhost:${app.port}`;
  const cfg = await (await fetch(`${base}/config.json`)).json();
  assert.ok(Array.isArray(cfg.fish) && cfg.fish.length > 0 && cfg.ui && cfg.leaderboard);
  assert.equal((await fetch(`${base}/..%2f..%2fpackage.json`)).status, 404);
  assert.equal((await fetch(`${base}/nope.html`)).status, 404);
  const c = await client(app);
  await c.waitFor((m) => seatedCount(m) === 0);
  c.send({ t: 'sim', kind: 'join1' });
  await c.waitFor((m) => seatedCount(m) === 1);
  c.ws.close();
}));

test('bad messages do not kill the server', () => withServer(async (app) => {
  const c = await client(app);
  c.send('không phải json');
  c.send({ t: 'khong_biet' });
  c.send({ t: 'sim', kind: 'khong_biet', coins: 'abc' });
  const before = c.msgs.length;
  await c.waitFor(() => c.msgs.length > before + 1 && c.msgs.at(-1).t === 'snapshot');
  c.ws.close();
}));

test('foreign Origin is rejected, local Origin accepted', () => withServer(async (app) => {
  await assert.rejects(client(app, { origin: 'http://evil.example' }));
  const ok = await client(app, { origin: `http://localhost:${app.port}` });
  ok.ws.close();
}));

test('status has players and storm; kick removes seated player', () => withServer(async (app) => {
  const c = await client(app);
  c.send({ t: 'sim', kind: 'join1' });
  const st = await c.waitFor((m) => m.t === 'status' && m.data.players.length === 1);
  assert.equal(typeof st.data.storm, 'boolean');
  assert.equal(st.data.seated, 1);
  c.send({ t: 'kick', userId: st.data.players[0].userId });
  await c.waitFor((m) => m.t === 'events' && m.data.some((e) => e.kind === 'leave'));
  const mark = c.msgs.length;
  await c.waitFor((m) => c.msgs.indexOf(m) >= mark && m.t === 'snapshot');
  assert.equal(seatedCount(c.msgs.slice(mark).find((m) => m.t === 'snapshot')), 0);
  c.ws.close();
}));

// GET thô với Host tự đặt (fetch không cho đổi Host).
function rawGet(port, pathname, host) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: pathname, headers: { host } }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('error', reject);
  });
}

test('LAN IP host with matching Origin accepted (WS and HTTP)', () => withServer(async (app) => {
  const host = `192.168.1.10:${app.port}`;
  const ok = await client(app, { origin: `http://${host}`, headers: { host } });
  ok.ws.close();
  assert.equal(await rawGet(app.port, '/admin', host), 302); // chưa đăng nhập: chuyển tới trang đăng nhập
  const v6 = `[::1]:${app.port}`;
  (await client(app, { origin: `http://${v6}`, headers: { host: v6 } })).ws.close();
}));

test('DNS-rebinding: other DNS hostnames rejected for WS and HTTP', () => withServer(async (app) => {
  const lan = `cauca.lan:${app.port}`;
  await assert.rejects(client(app, { origin: `http://${lan}`, headers: { host: lan } }));
  await assert.rejects(client(app, { headers: { host: lan } })); // không có Origin vẫn xét Host
  const evil = `evil.example:${app.port}`;
  for (const p of ['/admin', '/config.json', '/game']) {
    const code = await rawGet(app.port, p, evil);
    assert.ok(code === 403 || code === 404, `${p} -> ${code}`);
  }
}));

test('foreign Origin rejected; localhost and 127.0.0.1 still accepted', () => withServer(async (app) => {
  const host = `192.168.1.10:${app.port}`;
  await assert.rejects(client(app, { origin: 'http://evil.example', headers: { host } }));
  await assert.rejects(client(app, { origin: `http://evil.example:${app.port}` }));
  await assert.rejects(client(app, { origin: 'not a url', headers: { host } }));
  (await client(app, { origin: `http://localhost:${app.port}` })).ws.close();
  (await client(app, { origin: `http://127.0.0.1:${app.port}`, headers: { host: `127.0.0.1:${app.port}` } })).ws.close();
  assert.equal(await rawGet(app.port, '/config.json', `localhost:${app.port}`), 200);
}));

test('busy port rejects with EADDRINUSE and leaves nothing running', async () => {
  const blocker = net.createServer();
  await new Promise((r) => blocker.listen(0, '127.0.0.1', r));
  const { port } = blocker.address();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cauca-'));
  const file = path.join(dir, 'players.json');
  try {
    await assert.rejects(startServer(loadConfig(), { port, dataFile: file }), (err) => err.code === 'EADDRINUSE');
    assert.ok(!fs.existsSync(file), 'không ghi dữ liệu khi không mở được cổng');
  } finally {
    await new Promise((r) => blocker.close(r));
  }
});

test('trang admin buộc đăng nhập; sai mật khẩu bị từ chối; đúng mật khẩu mở được', () => withServer(async (app) => {
  const base = `http://localhost:${app.port}`;
  const r1 = await fetch(`${base}/admin/`, { redirect: 'manual' });
  assert.equal(r1.status, 302);
  assert.equal(r1.headers.get('location'), '/admin/login.html');
  assert.equal((await fetch(`${base}/admin/login.html`)).status, 200);
  const bad = await fetch(`${base}/admin/api/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: ADMIN_USER, password: 'sai' }),
  });
  assert.equal(bad.status, 401);
  const cookie = await adminCookie(app);
  const ok = await fetch(`${base}/admin/`, { headers: { Cookie: cookie } });
  assert.equal(ok.status, 200);
}));

test('lệnh điều khiển bị từ chối khi chưa đăng nhập admin', () => withServer(async (app) => {
  const c = await client(app, { admin: false });
  const auth = await c.waitFor((m) => m.t === 'auth');
  assert.equal(auth.data.admin, false);
  c.send({ t: 'sim', kind: 'join1' });
  const err = await c.waitFor((m) => m.t === 'error');
  assert.match(err.data.message, /đăng nhập admin/);
  c.send({ t: 'escape' });
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(c.msgs.filter((m) => m.t === 'snapshot').slice(-1)[0].data.seats.filter(Boolean).length, 0);
  c.ws.close();
}));

test('đăng nhập sai 5 lần thì bị khoá tạm (429)', () => withServer(async (app) => {
  const url = `http://localhost:${app.port}/admin/api/login`;
  const body = JSON.stringify({ username: ADMIN_USER, password: 'sai' });
  for (let i = 0; i < 5; i++) await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  const locked = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }) });
  assert.equal(locked.status, 429);
  assert.ok(Number(locked.headers.get('retry-after')) > 0);
}));
