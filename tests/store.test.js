import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPlayerStore, localDateKey } from '../server/store/playerStore.js';

const silent = () => {};
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cauca-store-'));
const user = { id: 'u1', name: 'An', avatar: 'a.png' };
const fish = (kg, fishId = 'ca_loc', fishName = 'Cá lóc') => ({ fishId, fishName, tier: 'common', kg });
const local = (d, h, m) => new Date(2026, 10, d, h, m).getTime();

async function makeStore(file) {
  const s = createPlayerStore(file, { log: silent });
  await s.load();
  return s;
}

test('roundtrip', async () => {
  const file = path.join(tmp(), 'players.json');
  const s = await makeStore(file);
  const now = local(7, 10, 0);
  const first = s.getOrCreate(user, now);
  assert.equal(first.isReturning, false);
  assert.equal(first.record.level, 1);
  s.recordCatch('u1', fish(2.5), now);
  await s.saveNow();
  const s2 = await makeStore(file);
  const again = s2.getOrCreate(user, now + 1000);
  assert.equal(again.isReturning, true);
  assert.equal(again.record.totalKg, 2.5);
  assert.equal(again.record.catches, 1);
  assert.equal(s2.todayRecord(now).kg, 2.5);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).version, 1);
});

test('missing file starts empty (creates data dir)', async () => {
  const file = path.join(tmp(), 'sub', 'players.json');
  const s = await makeStore(file);
  assert.equal(s.get('u1'), undefined);
  assert.equal(s.todayRecord(Date.now()), null);
  s.getOrCreate(user, 1);
  await s.saveNow();
  assert.ok(fs.existsSync(file));
});

test('corrupt file renamed to players.corrupt-*.json and starts empty', async () => {
  const dir = tmp();
  const file = path.join(dir, 'players.json');
  fs.writeFileSync(file, '{ not json');
  const warnings = [];
  const s = createPlayerStore(file, { log: (m) => warnings.push(m) });
  await s.load();
  assert.equal(s.get('u1'), undefined);
  assert.equal(warnings.length, 1);
  const names = fs.readdirSync(dir);
  assert.ok(names.some((n) => /^players\.corrupt-.+\.json$/.test(n)));
  assert.ok(!names.includes('players.json'));
});

test('atomic: no .tmp left after save', async () => {
  const dir = tmp();
  const s = await makeStore(path.join(dir, 'players.json'));
  s.getOrCreate(user, 1);
  await s.saveNow();
  assert.deepEqual(fs.readdirSync(dir), ['players.json']);
});

test('concurrent saveNow calls both resolve and final file has latest data', async () => {
  const file = path.join(tmp(), 'players.json');
  const s = await makeStore(file);
  s.getOrCreate(user, 1);
  const p1 = s.saveNow();
  s.recordCatch('u1', fish(9), 2);
  const p2 = s.saveNow();
  await Promise.all([p1, p2]);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).players.u1.totalKg, 9);
});

test('collection tracks count and bestKg', async () => {
  const s = await makeStore(path.join(tmp(), 'p.json'));
  s.getOrCreate(user, 1);
  s.recordCatch('u1', fish(2), 1);
  s.recordCatch('u1', fish(5), 2);
  s.recordCatch('u1', fish(3), 3);
  assert.deepEqual(s.get('u1').collection.ca_loc, { count: 3, bestKg: 5 });
  assert.equal(s.get('u1').totalKg, 10);
});

test('trash counts as a catch but never sets a record', async () => {
  const s = await makeStore(path.join(tmp(), 'p.json'));
  s.getOrCreate(user, 1);
  s.recordCatch('u1', { fishId: 'rac', fishName: 'Rác', tier: 'trash', kg: 0 }, local(7, 9, 0));
  assert.equal(s.todayRecord(local(7, 9, 0)), null);
});

test('today record updates only when heavier', async () => {
  const s = await makeStore(path.join(tmp(), 'p.json'));
  const now = local(7, 9, 0);
  s.getOrCreate(user, now);
  s.getOrCreate({ id: 'u2', name: 'Bo', avatar: '' }, now);
  s.recordCatch('u1', fish(4), now);
  s.recordCatch('u2', fish(3, 'ca_tre', 'Cá trê'), now);
  assert.deepEqual(s.todayRecord(now), { userId: 'u1', name: 'An', fishName: 'Cá lóc', kg: 4 });
  s.recordCatch('u2', fish(6, 'ca_tre', 'Cá trê'), now);
  assert.deepEqual(s.todayRecord(now), { userId: 'u2', name: 'Bo', fishName: 'Cá trê', kg: 6 });
});

test('today record rolls over at local midnight', async () => {
  const s = await makeStore(path.join(tmp(), 'p.json'));
  const d1 = local(7, 23, 59);
  const d2 = local(8, 0, 1);
  assert.notEqual(localDateKey(d1), localDateKey(d2));
  s.getOrCreate(user, d1);
  s.recordCatch('u1', fish(10), d1);
  s.recordCatch('u1', fish(1, 'ca_tre', 'Cá trê'), d2);
  assert.equal(s.todayRecord(d2).kg, 1);
  assert.equal(s.todayRecord(d2).fishName, 'Cá trê');
  assert.equal(s.todayRecord(d1).kg, 10);
});

test('getOrCreate refreshes name, avatar, lastSeen', async () => {
  const s = await makeStore(path.join(tmp(), 'p.json'));
  s.getOrCreate(user, 1000);
  const { record, isReturning } = s.getOrCreate({ id: 'u1', name: 'An2', avatar: 'b.png' }, 5000);
  assert.equal(isReturning, false);
  assert.equal(record.name, 'An2');
  assert.equal(record.avatar, 'b.png');
  assert.equal(record.lastSeen, new Date(5000).toISOString());
  assert.equal(record.firstSeen, new Date(1000).toISOString());
});

test('stop clears autosave and saves a final time', async () => {
  const file = path.join(tmp(), 'p.json');
  const s = await makeStore(file);
  s.startAutosave(10_000);
  s.getOrCreate(user, 1);
  await s.stop();
  assert.ok(fs.existsSync(file));
});
