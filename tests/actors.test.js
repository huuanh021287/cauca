import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSeatState, rodPath, linePath } from '../public/game/render/actors.js';
import { seatPosition } from '../public/game/layout.js';
import { loadConfig } from '../server/config/loadConfig.js';

const config = loadConfig();
const pos = seatPosition(0, config.ui);
const seat = (over = {}) => ({
  userId: 'u1', name: 'U1', rodColor: '#8b5a2b', bait: 0, legendary: false, aura: false,
  phase: 'idle', phaseStartedAt: 0, phaseEndsAt: 1000, lastCatch: null, sweetStart: null, sweetEnd: null,
  ...over,
});

test('idle: không có phao cắn, không thanh canh nhịp, không dấu hỏi', () => {
  const st = buildSeatState(seat(), pos, 500);
  assert.ok(st.bobber);
  assert.equal(st.meter, null);
  assert.equal(st.miss, false);
  assert.equal(st.fish, null);
});

test('bite: có thanh canh nhịp với vùng đúng nhịp trong [0,1]', () => {
  const s = seat({ phase: 'bite', phaseStartedAt: 0, phaseEndsAt: 4000, sweetStart: 800, sweetEnd: 1600 });
  const st = buildSeatState(s, pos, 1000);
  assert.equal(st.exclaim, true);
  assert.ok(st.meter.from >= 0 && st.meter.to <= 1 && st.meter.from < st.meter.to);
  assert.ok(Math.abs(st.meter.p - 0.25) < 1e-9);
});

test('result không có cá (cá thoát): đánh dấu miss, không có cá giơ lên', () => {
  const st = buildSeatState(seat({ phase: 'result', phaseStartedAt: 0, phaseEndsAt: 3000 }), pos, 500);
  assert.equal(st.miss, true);
  assert.equal(st.fish, null);
});

test('result có cá: có cá giơ lên, không miss', () => {
  const catchResult = { fishId: 'ca_ro', tier: 'common', kg: 1 };
  const st = buildSeatState(seat({ phase: 'result', phaseStartedAt: 0, phaseEndsAt: 3000, lastCatch: catchResult }), pos, 500);
  assert.equal(st.miss, false);
  assert.equal(st.fish.catch.fishId, 'ca_ro');
});

test('cheer: nhấc người lên theo hop, cần và tay cũng nhấc theo', () => {
  const base = buildSeatState(seat(), pos, 500);
  const cheered = buildSeatState(seat(), pos, 500, { hop: 4, wave: 1 });
  assert.equal(cheered.hop, 4);
  assert.equal(cheered.hand.y, base.hand.y - 4);
  assert.equal(cheered.tip.y, base.tip.y - 4);
});

test('rodPath và linePath trả về chuỗi d hợp lệ', () => {
  assert.match(rodPath({ x: 1, y: 2 }, { x: 10, y: 3 }, 2), /^M1 2 Q[-\d.]+ [-\d.]+ 10 3$/);
  assert.match(linePath({ x: 10, y: 3 }, { x: 20, y: 30 }), /^M10 3 Q[-\d.]+ [-\d.]+ 20 28$/);
});
