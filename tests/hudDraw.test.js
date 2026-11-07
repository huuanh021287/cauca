import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../server/config/loadConfig.js';
import { createHud } from '../public/game/render/hud.js';
import { createFireworks } from '../public/game/render/fx.js';
import { SCALE, safeRect } from '../public/game/layout.js';

const config = loadConfig();

// Canvas giả: ghi lại chữ và ô vẽ, đếm save/restore.
function fakeCtx() {
  const ctx = {
    texts: [], rects: [], depth: 0, maxDepth: 0,
    save() { this.depth += 1; this.maxDepth = Math.max(this.maxDepth, this.depth); },
    restore() { this.depth -= 1; },
    fillText(t) { this.texts.push(String(t)); },
    fillRect(x, y, w, h) { this.rects.push({ x, y, w, h, style: this.fillStyle }); },
    measureText: (t) => ({ width: String(t).length * 12 }),
  };
  return new Proxy(ctx, {
    get(target, k) { return k in target ? target[k] : () => {}; },
    set(target, k, v) { target[k] = v; return true; },
  });
}

test('one failing HUD section does not hide the others or leak save()', () => {
  const errors = [];
  const hud = createHud(config, { log: (m) => errors.push(m) });
  const snapshot = { seats: [], queueLength: 2 };
  Object.defineProperty(snapshot, 'leaderboard', { get() { throw new Error('bảng hỏng'); } });
  const ctx = fakeCtx();
  for (let f = 0; f < 3; f++) assert.doesNotThrow(() => hud.draw(ctx, { snapshot }, 1000 + f * 16));
  assert.equal(ctx.depth, 0);
  assert.ok(ctx.texts.some((t) => t.startsWith('Đang chờ')), 'hàng chờ vẫn được vẽ');
  assert.ok(ctx.texts.some((t) => /^\d\d[: ]\d\d$/.test(t)), 'đồng hồ vẫn được vẽ');
  assert.ok(errors.length >= 1 && errors.length < 3, 'lỗi được ghi nhưng không spam mỗi khung');
});

test('today record name line has no trailing dash', () => {
  const hud = createHud(config, { log: () => {} });
  const today = { userId: 'u1', name: 'Lan Chi', fishName: 'Cá lóc', kg: 2.3 };
  const ctx = fakeCtx();
  hud.draw(ctx, { snapshot: { seats: [], queueLength: 0, leaderboard: { session: [], today } } }, 15000);
  assert.ok(ctx.texts.includes('Lan Chi'));
  assert.ok(!ctx.texts.some((t) => t.endsWith(' —')));
});

test('fireworks never draw inside the top safe zone', () => {
  const top = safeRect(config.ui).top / SCALE;
  const fw = createFireworks({ width: 270, skyTop: top + 6, skyBottom: 170, minY: top });
  const ctx = fakeCtx();
  for (let n = 0; n < 5; n++) fw.launch('big', n * 100);
  for (let t = 0; t < 6000; t += 16) fw.draw(ctx, t, SCALE);
  assert.ok(ctx.rects.length > 1000);
  const minY = Math.min(...ctx.rects.map((r) => r.y));
  assert.ok(minY >= top * SCALE, `minY=${minY}`);
});

test('HUD fireworks sky starts below the top safe zone', () => {
  const hud = createHud(config, { log: () => {} });
  const ctx = fakeCtx();
  for (let n = 0; n < 5; n++) hud.fireworks.launch('big', n * 100);
  for (let t = 0; t < 6000; t += 16) hud.fireworks.draw(ctx, t, SCALE);
  assert.ok(Math.min(...ctx.rects.map((r) => r.y)) >= config.ui.safeTop);
});

test('bộ nhận chữ: khi bật thì drawOutlinedText không chạm ctx và trả về bề rộng', async () => {
  const { setTextSink, drawOutlinedText } = await import('../public/game/text.js');
  const calls = [];
  const ctx = new Proxy({}, { get: (_, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => calls.push(k)) });
  setTextSink((c, text, x, y, o) => { calls.push(['sink', text, x, y, o.size]); return 42; });
  try {
    assert.equal(drawOutlinedText(ctx, 'Xin chào', 1, 2, { size: 30 }), 42);
  } finally {
    setTextSink(null);
  }
  assert.deepEqual(calls, [['sink', 'Xin chào', 1, 2, 30]]);
});
