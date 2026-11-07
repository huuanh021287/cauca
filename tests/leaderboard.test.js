import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { createPlayerStore } from '../server/store/playerStore.js';
import { leaderboard } from '../server/game/leaderboard.js';

test('leaderboard: top 5 by kg desc, drops 0kg, today record included', async () => {
  const store = createPlayerStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cauca-lb-')), 'p.json'), { log() {} });
  await store.load();
  const now = new Date(2026, 10, 7, 12).getTime();
  const sessionKg = new Map();
  for (let i = 1; i <= 7; i++) {
    store.getOrCreate({ id: `u${i}`, name: `N${i}`, avatar: '' }, now);
    sessionKg.set(`u${i}`, i === 3 ? 0 : i * 1.23);
  }
  store.recordCatch('u7', { fishId: 'x', fishName: 'Cá X', tier: 'rare', kg: 8.61 }, now);
  const lb = leaderboard({ sessionKg, store, now, top: 5 });
  assert.deepEqual(lb.session.map((e) => e.name), ['N7', 'N6', 'N5', 'N4', 'N2']);
  assert.equal(lb.session[0].kg, 8.6);
  assert.equal(lb.today.name, 'N7');
  assert.equal(lb.today.kg, 8.61);
});

test('leaderboard: empty session and no record', async () => {
  const store = createPlayerStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cauca-lb-')), 'p.json'), { log() {} });
  await store.load();
  assert.deepEqual(leaderboard({ sessionKg: new Map(), store, now: 1, top: 5 }), { session: [], today: null });
});
