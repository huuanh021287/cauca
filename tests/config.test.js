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
