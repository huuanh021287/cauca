import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { WebSocket } from 'ws';
import { loadConfig } from '../server/config/loadConfig.js';
import { startServer } from '../server/app.js';

async function withServer(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cauca-'));
  const app = await startServer(loadConfig(), { port: 0, dataFile: path.join(dir, 'players.json') });
  try { await fn(app); } finally { await app.close(); }
}

// Mở WS, gom tin nhắn; waitFor(pred) đợi tin khớp (tối đa 3s).
async function client(app, opts) {
  const ws = new WebSocket(`ws://localhost:${app.port}/ws`, opts);
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

test('same-origin (LAN host) Origin accepted, foreign Origin still rejected', () => withServer(async (app) => {
  const host = `cauca.lan:${app.port}`;
  const ok = await client(app, { origin: `http://${host}`, headers: { host } });
  ok.ws.close();
  await assert.rejects(client(app, { origin: 'http://evil.example', headers: { host } }));
  await assert.rejects(client(app, { origin: `http://evil.example:${app.port}` }));
  await assert.rejects(client(app, { origin: 'not a url', headers: { host } }));
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
