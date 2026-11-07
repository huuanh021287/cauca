import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../server/config/loadConfig.js';
import { seatPosition, safeRect, skyPhase, colorFromName } from '../public/game/layout.js';

const { ui } = loadConfig();
const seats = Array.from({ length: 12 }, (_, i) => seatPosition(i, ui));

test('12 seat positions are distinct and inside the low-res canvas', () => {
  const keys = new Set(seats.map((p) => `${p.x},${p.y}`));
  assert.equal(keys.size, 12);
  for (const p of seats) {
    assert.ok(p.x >= 0 && p.x < 270, `x=${p.x}`);
    assert.ok(p.y >= 0 && p.y < 480, `y=${p.y}`);
  }
});

test('seats stay between the safe zones', () => {
  for (const p of seats) {
    assert.ok(p.y > ui.safeTop / 4, `y=${p.y}`);
    assert.ok(p.y < 480 - ui.safeBottom / 4, `y=${p.y}`);
  }
});

test('two rows of six, second row lower and offset by half a cell', () => {
  const row1 = seats.slice(0, 6);
  const row2 = seats.slice(6);
  assert.equal(new Set(row1.map((p) => p.y)).size, 1);
  assert.equal(new Set(row2.map((p) => p.y)).size, 1);
  assert.ok(row2[0].y > row1[0].y);
  const cell = row1[1].x - row1[0].x;
  assert.equal(row2[0].x - row1[0].x, cell / 2);
});

test('safeRect returns high-res safe band', () => {
  assert.deepEqual(safeRect(ui), { top: 160, bottom: 1920 - 260 });
});

test('skyPhase follows local hours', () => {
  assert.equal(skyPhase(new Date(2026, 10, 7, 5, 59)), 'night');
  assert.equal(skyPhase(new Date(2026, 10, 7, 6, 0)), 'day');
  assert.equal(skyPhase(new Date(2026, 10, 7, 16, 59)), 'day');
  assert.equal(skyPhase(new Date(2026, 10, 7, 17, 30)), 'dusk');
  assert.equal(skyPhase(new Date(2026, 10, 7, 19, 0)), 'night');
});

test('colorFromName is a stable hex color', () => {
  const c = colorFromName('abc');
  assert.match(c, /^#[0-9a-f]{6}$/);
  assert.equal(colorFromName('abc'), c);
  assert.notEqual(colorFromName('Thu Hà 2'), colorFromName('Minh Khoa 3'));
});
