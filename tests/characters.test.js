import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cheerPose, CHEER_MS } from '../public/game/render/characters.js';
import { CHAR_SCALE, CHAR_BOX } from '../public/game/layout.js';

test('cheerPose is null outside the ~2s cheer window', () => {
  assert.equal(CHEER_MS, 2000);
  assert.equal(cheerPose(null, 1000, 0), null);
  assert.equal(cheerPose(1000, 999, 0), null);
  assert.equal(cheerPose(1000, 1000 + CHEER_MS, 0), null);
  assert.ok(cheerPose(1000, 1000, 0));
});

test('cheer hops in whole body pixels, stays in the character box, and arms wave', () => {
  const hops = new Set();
  const waves = new Set();
  for (let t = 0; t < CHEER_MS; t += 16) {
    for (const i of [0, 5, 11]) {
      const p = cheerPose(0, t, i);
      assert.equal(p.hop % CHAR_SCALE, 0);
      assert.ok(p.hop >= 0 && p.hop <= 3 * CHAR_SCALE);
      assert.ok(p.hop < CHAR_BOX.top);
      hops.add(p.hop);
      waves.add(p.wave);
    }
  }
  assert.ok(hops.size >= 3, 'có nhún lên xuống');
  assert.deepEqual([...waves].sort(), [0, 1]);
});

test('seats do not hop in lockstep', () => {
  const differ = [0, 100, 200, 300].some((t) => cheerPose(0, t, 0).hop !== cheerPose(0, t, 1).hop);
  assert.ok(differ);
});
