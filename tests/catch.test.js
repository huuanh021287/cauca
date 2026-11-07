import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../server/config/loadConfig.js';
import { createRng, seqRng } from '../server/game/rng.js';
import { tierWeights, rollCatch, xpForCatch } from '../server/game/catch.js';

const config = loadConfig();
const round1 = (x) => Math.round(x * 10) / 10;

test('tierWeights without legendary moves 1% to common', () => {
  assert.deepEqual(tierWeights(config, { bait: false, legendary: false }),
    { trash: 15, common: 56, rare: 22, epic: 7, legendary: 0 });
});

test('tierWeights with legendary', () => {
  assert.deepEqual(tierWeights(config, { bait: false, legendary: true }),
    { trash: 15, common: 55, rare: 22, epic: 7, legendary: 1 });
});

test('tierWeights with bait', () => {
  const w = tierWeights(config, { bait: true, legendary: false });
  assert.deepEqual(w, { trash: 15, common: 27, rare: 44, epic: 14, legendary: 0 });
  assert.equal(Object.values(w).reduce((a, b) => a + b, 0), 100);
});

test('rollCatch picks tier by cumulative weight', () => {
  const f = { bait: false, legendary: false, reelBonus: false };
  assert.equal(rollCatch(config, f, seqRng([0.10, 0, 0])).tier, 'trash');
  assert.equal(rollCatch(config, f, seqRng([0.20, 0, 0])).tier, 'common');
  assert.equal(rollCatch(config, { ...f, legendary: true }, seqRng([0.995, 0, 0])).tier, 'legendary');
});

test('rollCatch never yields legendary without flag', () => {
  const rng = createRng(1);
  for (let i = 0; i < 10000; i++) {
    const r = rollCatch(config, { bait: false, legendary: false, reelBonus: false }, rng);
    assert.notEqual(r.tier, 'legendary');
  }
});

test('trash has kg 0', () => {
  const r = rollCatch(config, {}, seqRng([0.1, 0, 0]));
  assert.equal(r.tier, 'trash');
  assert.equal(r.kg, 0);
});

test('kg within range and rounded to 0.1', () => {
  const rng = createRng(7);
  const idx = config.fish.filter((f) => f.tier === 'common').findIndex((f) => f.id === 'ca_loc');
  const n = config.fish.filter((f) => f.tier === 'common').length;
  for (let i = 0; i < 200; i++) {
    const r = rollCatch(config, {}, seqRng([0.20, (idx + 0.5) / n, rng()]));
    assert.equal(r.fishId, 'ca_loc');
    assert.ok(r.kg >= 0.5 && r.kg <= 3);
    assert.ok(Math.abs(r.kg * 10 - Math.round(r.kg * 10)) < 1e-9);
  }
});

test('reelBonus multiplies kg by 1.2', () => {
  for (const x of [0, 0.3, 0.77, 0.99]) {
    const a = rollCatch(config, { reelBonus: false }, seqRng([0.20, 0.5, x]));
    const b = rollCatch(config, { reelBonus: true }, seqRng([0.20, 0.5, x]));
    const fish = config.fish.find((f) => f.id === a.fishId);
    const raw = fish.weightKg[0] + x * (fish.weightKg[1] - fish.weightKg[0]);
    assert.equal(b.kg, round1(raw * 1.2));
  }
});

test('xpForCatch', () => {
  assert.equal(xpForCatch(config, { tier: 'common', kg: 2.3 }), 23);
  assert.equal(xpForCatch(config, { tier: 'trash', kg: 0 }), 1);
});
