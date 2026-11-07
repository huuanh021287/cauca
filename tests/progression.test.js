import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../server/config/loadConfig.js';
import { xpToNext, applyXp, titleFor } from '../server/game/progression.js';

const config = loadConfig();

test('xpToNext', () => {
  assert.equal(xpToNext(config, 1), 50);
  assert.equal(xpToNext(config, 4), 400);
});

test('applyXp multi-level', () => {
  const p = { xp: 0, level: 1 };
  assert.equal(applyXp(config, p, 200), 2);
  assert.equal(p.level, 3);
  assert.equal(p.xp, 9);
});

test('applyXp caps at maxLevel', () => {
  const p = { xp: 0, level: 49 };
  assert.equal(applyXp(config, p, 1e9), 1);
  assert.equal(p.level, config.xp.maxLevel);
  assert.equal(applyXp(config, p, 1000), 0);
  assert.equal(p.level, config.xp.maxLevel);
});

test('titleFor', () => {
  assert.equal(titleFor(config, 20).aura, true);
  assert.equal(titleFor(config, 19).aura, false);
  assert.equal(titleFor(config, 19).name, 'Sát thủ ao làng');
  assert.equal(titleFor(config, 50).name, 'Thần câu');
});
