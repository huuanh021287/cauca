import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, validateConfig, ConfigError } from '../server/config/loadConfig.js';

const base = () => JSON.parse(fs.readFileSync('config/game.config.json', 'utf8'));
const has = (errs, s) => errs.some((e) => e.includes(s));

test('default config is valid', () => {
  assert.deepEqual(validateConfig(base()), []);
});

test('tiers must sum to 100', () => {
  const c = base();
  c.tiers.common = 50;
  assert.ok(has(validateConfig(c), 'tiers'));
});

test('weightKg min > max rejected', () => {
  const c = base();
  c.fish[5].weightKg = [3, 1];
  assert.ok(has(validateConfig(c), 'fish[5].weightKg'));
});

test('duplicate fish id rejected', () => {
  const c = base();
  c.fish[1].id = c.fish[0].id;
  assert.ok(has(validateConfig(c), 'trùng'));
});

test('every tier needs a fish', () => {
  const c = base();
  c.fish = c.fish.filter((f) => f.tier !== 'legendary');
  assert.ok(has(validateConfig(c), 'legendary'));
});

test('underscore keys ignored', () => {
  const c = base();
  c.dock._ghiChu = 'x';
  assert.deepEqual(validateConfig(c), []);
});

test('loadConfig throws ConfigError on bad JSON', () => {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-')), 'bad.json');
  fs.writeFileSync(p, '{');
  assert.throws(() => loadConfig(p), ConfigError);
});

test('loadConfig loads default', () => {
  const c = loadConfig();
  assert.equal(c.dock.seats, 12);
});

test('gift effect params validated per effect', () => {
  const bad = (mut, needle) => {
    const c = base();
    mut(c.gifts);
    assert.ok(has(validateConfig(c), needle), `${needle}: ${validateConfig(c).join(' | ')}`);
  };
  bad((g) => { delete g[0].fastSec; }, 'gifts[0].fastSec');
  bad((g) => { g[0].fastMaxSec = 0; }, 'gifts[0].fastMaxSec');
  bad((g) => { g[0].waitMultiplier = 0; }, 'gifts[0].waitMultiplier');
  bad((g) => { g[0].waitMultiplier = 1.5; }, 'gifts[0].waitMultiplier');
  bad((g) => { g[1].bait = 2.5; }, 'gifts[1].bait');
  bad((g) => { g[1].bait = 0; }, 'gifts[1].bait');
  bad((g) => { g[1].fireworks = 'huge'; }, 'gifts[1].fireworks');
  const ok = base();
  ok.gifts[0].waitMultiplier = 1;
  delete ok.gifts[1].fireworks;
  assert.deepEqual(validateConfig(ok), []);
});

test('dock must fit the 2-row × 6-seat game screen', () => {
  const errsFor = (mut) => { const c = base(); mut(c.dock); return validateConfig(c); };
  assert.ok(has(errsFor((d) => { d.rows = 3; }), 'dock.rows'));
  assert.ok(has(errsFor((d) => { d.seats = 13; }), 'dock.seats'));
  assert.ok(has(errsFor((d) => { d.seats = 13; }), '2 hàng × 6 ghế'));
  assert.ok(has(errsFor((d) => { d.seats = 6.5; }), 'dock.seats'));
  assert.deepEqual(errsFor((d) => { d.seats = 8; }), []);
});

test('server.port must be an integer 1–65535', () => {
  for (const port of [0, 70000, 3000.5]) {
    const c = base();
    c.server.port = port;
    assert.ok(has(validateConfig(c), 'server.port'), String(port));
  }
});
