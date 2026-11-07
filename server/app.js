// Máy chủ: HTTP tĩnh, WebSocket, gom sự kiện, vòng lặp game và giả lập.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createRng } from './game/rng.js';
import { createGame } from './game/engine.js';
import { createPlayerStore } from './store/playerStore.js';
import { createListener } from './tiktok/listener.js';
import { createTikTokConnection } from './tiktok/connection.js';
import { createSimulator } from './sim/simulator.js';
import { createAdminAuth, loadAdminAccount, tokenFromCookie, sessionCookie, clearCookie } from './auth/admin.js';

// Trang admin chỉ mở được sau khi đăng nhập; trang đăng nhập và file CSS của nó thì công khai.
const ADMIN_PUBLIC = new Set(['/admin/login.html', '/admin/login.js', '/admin/admin.css']);
// Lệnh điều khiển qua WebSocket: chỉ phiên admin hợp lệ mới được thực hiện.
const ADMIN_MESSAGES = new Set(['connect', 'disconnect', 'sim', 'storm', 'kick', 'escape']);
const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };

function readJson(req, limit, cb) {
  let size = 0;
  const chunks = [];
  req.on('data', (c) => {
    size += c.length;
    if (size > limit) { req.destroy(); return; }
    chunks.push(c);
  });
  req.on('end', () => {
    try { cb(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { cb(null); }
  });
  req.on('error', () => {});
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const DEFAULT_DATA_FILE = path.join(ROOT, 'data', 'players.json');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml',
};
const STORM = { durationSec: 60, users: 50, likesPerMin: 3000 };
const RATE_WINDOW_MS = 60000;

// Gom sự kiện trong `batchMs`; like của cùng một người cộng dồn thành một sự kiện.
export function createBatcher({ batchMs, onFlush, schedule = setTimeout }) {
  let buffer = [];
  let likeIndex = new Map(); // userId -> sự kiện like trong buffer
  let timer = null;

  function flushNow() {
    timer = null;
    if (buffer.length === 0) return;
    const out = buffer;
    buffer = [];
    likeIndex = new Map();
    onFlush(out);
  }

  function push(ev) {
    if (ev.type === 'like') {
      const existing = likeIndex.get(ev.user.id);
      if (existing) existing.count = (existing.count ?? 1) + (ev.count ?? 1);
      else {
        const copy = { ...ev, count: ev.count ?? 1 };
        likeIndex.set(ev.user.id, copy);
        buffer.push(copy);
      }
    } else buffer.push(ev);
    if (timer === null) timer = schedule(flushNow, batchMs);
  }

  return { push, flushNow };
}

// Cắt bớt DisplayEvent khi quá nhiều: giữ theo độ ưu tiên, giữ nguyên thứ tự gốc.
function priority(ev) {
  if (ev.kind === 'gift') return 0;
  if (ev.kind === 'level_up') return 1;
  if (ev.kind === 'catch' && ['legendary', 'epic', 'rare'].includes(ev.tier)) return 2;
  if (ev.kind === 'welcome_back') return 3;
  if (ev.kind === 'follow_thanks') return 4;
  if (ev.kind === 'share_thanks') return 5;
  return 6;
}

export function trimEvents(events, max) {
  if (events.length <= max) return events;
  const keep = new Set(
    events.map((e, i) => ({ i, p: priority(e) })).sort((a, b) => a.p - b.p || a.i - b.i).slice(0, max).map((x) => x.i),
  );
  return events.filter((_, i) => keep.has(i));
}

// Chống DNS rebinding: chỉ phục vụ request có Host là địa chỉ IP, `localhost` hoặc đúng `server.host`.
// Trang lạ đổi DNS tên miền của nó về 127.0.0.1 sẽ gửi Host là tên miền đó → bị từ chối.
export function hostAllowed(hostHeader, configuredHost) {
  if (typeof hostHeader !== 'string' || !hostHeader) return false;
  let hostname;
  try {
    hostname = new URL(`http://${hostHeader}`).hostname.toLowerCase();
  } catch {
    return false;
  }
  hostname = hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(hostname) !== 0 || hostname === 'localhost') return true;
  return typeof configuredHost === 'string' && hostname === configuredHost.toLowerCase();
}

function handleAdminApi(req, res, auth) {
  const p = req.url.split('?')[0];
  if (req.method === 'POST' && p === '/admin/api/login') {
    readJson(req, 1024, (body) => {
      if (!body || typeof body.username !== 'string' || typeof body.password !== 'string') {
        res.writeHead(400, JSON_HEADERS).end(JSON.stringify({ ok: false, message: 'Thiếu tên đăng nhập hoặc mật khẩu.' }));
        return;
      }
      const r = auth.login(req.socket.remoteAddress ?? 'unknown', body.username, body.password);
      if (r.ok) {
        res.writeHead(200, { ...JSON_HEADERS, 'Set-Cookie': sessionCookie(r.token) }).end('{"ok":true}');
        return;
      }
      if (r.status === 503) {
        res.writeHead(503, JSON_HEADERS).end(JSON.stringify({ ok: false, message: 'Chưa tạo tài khoản admin. Chạy: node scripts/set-admin.js' }));
        return;
      }
      if (r.status === 429) {
        const min = Math.ceil(r.retryAfterSec / 60);
        res.writeHead(429, { ...JSON_HEADERS, 'Retry-After': String(r.retryAfterSec) })
          .end(JSON.stringify({ ok: false, message: `Đăng nhập sai nhiều lần. Thử lại sau ${min} phút.` }));
        return;
      }
      res.writeHead(401, JSON_HEADERS).end(JSON.stringify({ ok: false, message: 'Sai tên đăng nhập hoặc mật khẩu.' }));
    });
    return;
  }
  if (req.method === 'POST' && p === '/admin/api/logout') {
    auth.logout(tokenFromCookie(req.headers.cookie));
    res.writeHead(200, { ...JSON_HEADERS, 'Set-Cookie': clearCookie() }).end('{"ok":true}');
    return;
  }
  res.writeHead(404).end();
}

function serveStatic(req, res) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (pathname.includes('..') || pathname.includes('\0')) {
    res.writeHead(404).end();
    return;
  }
  if (pathname === '/game' || pathname === '/game/') pathname = '/game/index.html';
  else if (pathname === '/admin' || pathname === '/admin/') pathname = '/admin/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, pathname));
  const type = MIME[path.extname(file).toLowerCase()];
  if (!type || !file.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(404).end();
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': type }).end(data);
  });
}

export async function startServer(config, { port, dataFile = DEFAULT_DATA_FILE, connect = createTikTokConnection } = {}) {
  const sv = config.server;
  const log = (msg) => console.log(msg);
  const store = createPlayerStore(dataFile, { log: (m) => console.warn(m) });
  await store.load();
  const rng = createRng(Date.now());
  const auth = createAdminAuth(loadAdminAccount(path.join(path.dirname(dataFile), 'admin.json')));
  if (!auth.configured) console.warn('Chưa có tài khoản admin: chạy `node scripts/set-admin.js` để mở trang admin.');
  const game = createGame({ config, players: store, rng });
  const sim = createSimulator({ rng, launchId: Date.now().toString(36), commands: { cast: config.commands.cast[0], reel: config.commands.reel[0] } });

  const clientConfig = JSON.stringify({
    ui: config.ui, assets: config.assets, leaderboard: config.leaderboard,
    fish: config.fish.map(({ id, name, tier, sprite }) => ({ id, name, tier, sprite })),
  });

  const server = http.createServer((req, res) => {
    if (!hostAllowed(req.headers.host, sv.host)) {
      res.writeHead(403).end();
      return;
    }
    const urlPath = req.url.split('?')[0];
    if (urlPath.startsWith('/admin/api/')) {
      handleAdminApi(req, res, auth);
      return;
    }
    const isAdminPage = urlPath === '/admin' || urlPath === '/admin/' || (urlPath.startsWith('/admin/') && !ADMIN_PUBLIC.has(urlPath));
    if (isAdminPage && req.method === 'GET' && !auth.valid(tokenFromCookie(req.headers.cookie))) {
      res.writeHead(302, { Location: '/admin/login.html' }).end();
      return;
    }
    if (req.method === 'GET' && req.url.split('?')[0] === '/config.json') {
      res.writeHead(200, { 'Content-Type': MIME['.json'] }).end(clientConfig);
      return;
    }
    if (req.method !== 'GET') {
      res.writeHead(405).end();
      return;
    }
    serveStatic(req, res);
  });
  const wss = new WebSocketServer({
    server, path: '/ws', maxPayload: 64 * 1024,
    verifyClient: ({ origin, req }) => {
      if (!hostAllowed(req.headers.host, sv.host)) return false;
      if (!origin) return true; // OBS / LIVE Studio / client Node không gửi Origin
      const p = server.address()?.port;
      if (origin === `http://localhost:${p}` || origin === `http://127.0.0.1:${p}`) return true;
      // Cùng nguồn (mở bằng IP trong LAN hoặc đúng server.host): Origin trùng Host đã được cho phép.
      try {
        return Boolean(req.headers.host) && new URL(origin).host === req.headers.host;
      } catch {
        return false;
      }
    },
  });
  // WebSocketServer chuyển tiếp lỗi của http server (vd. EADDRINUSE): bắt lại để không sập tiến trình.
  let failListen = null;
  wss.on('error', (err) => {
    if (failListen) failListen(err);
    else console.error(`lỗi WebSocket server: ${err.message}`);
  });
  const guard = (name, fn) => () => {
    try { fn(); } catch (err) { console.error(`lỗi ${name}: ${err.stack ?? err}`); }
  };

  const send = (ws, msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };
  const broadcast = (msg) => {
    const text = JSON.stringify(msg);
    for (const ws of wss.clients) if (ws.readyState === 1) ws.send(text);
  };
  const broadcastEvents = (events) => {
    if (events.length) broadcast({ t: 'events', data: trimEvents(events, sv.maxDisplayEventsPerFlush) });
  };

  // Trạng thái và đếm sự kiện/phút (cửa sổ trượt 60s).
  let tiktok = { tiktok: 'offline', message: 'Chưa kết nối' };
  const stamps = [];
  let stormStop = null;
  const noteEvent = () => stamps.push(Date.now());

  function statusData() {
    const now = Date.now();
    while (stamps.length && stamps[0] < now - RATE_WINDOW_MS) stamps.shift();
    const snap = game.snapshot(now);
    const players = snap.seats.filter(Boolean).map((s) => ({ userId: s.userId, name: s.name, level: s.level }));
    return {
      ...tiktok, seated: players.length, queued: snap.queueLength,
      eventsPerMin: stamps.length, players, storm: stormStop !== null,
    };
  }
  const sendStatus = () => broadcast({ t: 'status', data: statusData() });

  const batcher = createBatcher({
    batchMs: sv.batchMs,
    onFlush: (events) => {
      const now = Date.now();
      const out = [];
      for (const ev of events) {
        try { out.push(...game.handle(ev, now)); } catch (err) { console.error(`lỗi xử lý sự kiện: ${err.stack ?? err}`); }
      }
      try { broadcastEvents(out); } catch (err) { console.error(`lỗi gửi sự kiện: ${err.stack ?? err}`); }
    },
  });
  const ingest = (ev) => { noteEvent(); batcher.push(ev); };

  const listener = createListener({
    config, connect, onEvent: ingest,
    onStatus: (s) => { tiktok = s; sendStatus(); },
  });

  const seatedUsers = () => game.snapshot(Date.now()).seats.filter(Boolean)
    .map((s) => ({ id: s.userId, name: s.name, avatar: s.avatar }));

  function onMessage(msg, ws) {
    if (ADMIN_MESSAGES.has(msg?.t)) {
      // Kiểm tra lại phiên mỗi lần: phiên có thể đã hết hạn hoặc bị đăng xuất.
      ws.isAdmin = auth.valid(ws.token);
      if (!ws.isAdmin) {
        send(ws, { t: 'error', data: { message: 'Cần đăng nhập admin.' } });
        return;
      }
    }
    switch (msg?.t) {
      case 'connect': listener.start(msg.username); break;
      case 'disconnect': listener.stop(); break;
      case 'sim':
      {
        const c = Number(msg.coins);
        const coins = Number.isFinite(c) ? Math.max(1, Math.floor(c)) : 1;
        for (const ev of sim.make(msg.kind, { coins }, seatedUsers())) ingest(ev);
      }
        break;
      case 'storm':
        if (stormStop) stormStop();
        else {
          const stop = sim.storm(STORM, ingest, setTimeout);
          const done = setTimeout(() => { stormStop = null; sendStatus(); }, STORM.durationSec * 1000);
          done.unref();
          stormStop = () => { stop(); clearTimeout(done); stormStop = null; };
        }
        sendStatus();
        break;
      case 'kick': broadcastEvents(game.kick(String(msg.userId), Date.now())); break;
      case 'escape': broadcastEvents(game.escapeBites(Date.now())); break;
      default: break;
    }
  }

  wss.on('connection', (ws, req) => {
    ws.token = tokenFromCookie(req.headers.cookie);
    ws.isAdmin = auth.valid(ws.token);
    send(ws, { t: 'auth', data: { admin: ws.isAdmin } });
    send(ws, { t: 'snapshot', data: game.snapshot(Date.now()) });
    send(ws, { t: 'status', data: statusData() });
    ws.on('error', (err) => { console.error(`lỗi WebSocket: ${err.message}`); ws.terminate(); });
    ws.on('message', (raw) => {
      try { onMessage(JSON.parse(raw.toString()), ws); } catch (err) { log(`tin nhắn lỗi: ${err.message}`); }
    });
  });

  // Mở cổng trước; chỉ chạy vòng lặp và tự lưu khi đã mở được (cổng bận thì không để lại gì).
  try {
    await new Promise((resolve, reject) => {
      failListen = reject;
      server.listen(port ?? sv.port, sv.host ?? '127.0.0.1', resolve);
    });
  } catch (err) {
    await new Promise((r) => wss.close(r));
    throw err;
  } finally {
    failListen = null;
  }

  store.startAutosave(sv.autosaveMs);
  const tickTimer = setInterval(guard('tick', () => broadcastEvents(game.tick(Date.now()))), sv.tickMs);
  const snapTimer = setInterval(guard('snapshot', () => broadcast({ t: 'snapshot', data: game.snapshot(Date.now()) })), sv.snapshotMs);
  const statusTimer = setInterval(guard('status', sendStatus), 1000);

  return {
    port: server.address().port,
    async close() {
      clearInterval(tickTimer);
      clearInterval(snapTimer);
      clearInterval(statusTimer);
      if (stormStop) { stormStop(); stormStop = null; }
      listener.stop();
      for (const ws of wss.clients) ws.terminate();
      await new Promise((r) => wss.close(r));
      await new Promise((r) => { server.close(r); server.closeAllConnections?.(); });
      await store.stop();
    },
  };
}
