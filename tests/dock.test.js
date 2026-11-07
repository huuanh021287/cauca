import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../server/config/loadConfig.js';
import { createDock, touch, sweepIdle, kick, seatOf } from '../server/game/dock.js';

const config = loadConfig();
const u = (n) => ({ id: `u${n}`, name: `U${n}`, avatar: '' });
const t0 = 1_000_000;
const seated = (dock) => dock.seats.filter(Boolean).length;
const fill = (dock, n, now = t0) => { for (let i = 1; i <= n; i++) touch(dock, u(i), now); };

test('join fills first empty seat', () => {
  const dock = createDock(config);
  assert.deepEqual(touch(dock, u(1), t0), { result: 'seated', seatIndex: 0 });
  assert.deepEqual(touch(dock, u(2), t0), { result: 'seated', seatIndex: 1 });
  assert.equal(seatOf(dock, 'u2'), 1);
  assert.equal(seatOf(dock, 'nope'), -1);
});

test('join twice keeps one seat', () => {
  const dock = createDock(config);
  touch(dock, u(1), t0);
  const r = touch(dock, { ...u(1), name: 'Mới' }, t0 + 5000);
  assert.deepEqual(r, { result: 'already_seated', seatIndex: 0 });
  assert.equal(seated(dock), 1);
  assert.equal(dock.seats[0].lastActive, t0 + 5000);
  assert.equal(dock.seats[0].user.name, 'Mới');
});

test('13th user goes to queue', () => {
  const dock = createDock(config);
  fill(dock, 12);
  assert.equal(seated(dock), 12);
  assert.deepEqual(touch(dock, u(13), t0), { result: 'queued' });
  assert.equal(dock.queue.length, 1);
});

test('queued twice keeps one entry', () => {
  const dock = createDock(config);
  fill(dock, 12);
  touch(dock, u(13), t0);
  touch(dock, u(13), t0 + 1);
  assert.equal(dock.queue.length, 1);
});

test('queued user who interacts is promoted to front', () => {
  const dock = createDock(config);
  fill(dock, 12);
  for (const n of [13, 14, 15]) touch(dock, u(n), t0);
  assert.deepEqual(touch(dock, u(15), t0 + 10), { result: 'promoted' });
  assert.deepEqual(dock.queue.map((q) => q.user.id), ['u15', 'u13', 'u14']);
});

test('queue_full beyond queueMax', () => {
  const dock = createDock(config);
  fill(dock, 12 + config.dock.queueMax);
  assert.equal(dock.queue.length, config.dock.queueMax);
  assert.deepEqual(touch(dock, u(999), t0), { result: 'queue_full' });
  assert.equal(dock.queue.length, config.dock.queueMax);
});

test('idle 300s leaves and first queued fills seat', () => {
  const dock = createDock(config);
  touch(dock, u(1), t0);
  for (let i = 2; i <= 12; i++) touch(dock, u(i), t0 + 100_000);
  touch(dock, u(13), t0 + 100_000);
  touch(dock, u(14), t0 + 100_000);
  const r = sweepIdle(dock, t0 + 300_000);
  assert.deepEqual(r.left, [{ userId: 'u1', name: 'U1', seatIndex: 0 }]);
  assert.deepEqual(r.filled, [{ seatIndex: 0, user: u(13) }]);
  assert.deepEqual(r.dropped, []);
  assert.equal(dock.seats[0].user.id, 'u13');
  assert.deepEqual(dock.queue.map((q) => q.user.id), ['u14']);
});

test('idle 299s stays', () => {
  const dock = createDock(config);
  touch(dock, u(1), t0);
  const r = sweepIdle(dock, t0 + 299_000);
  assert.deepEqual(r, { left: [], filled: [], dropped: [] });
  assert.equal(seatOf(dock, 'u1'), 0);
});

test('queued idle 300s dropped from queue', () => {
  const dock = createDock(config);
  fill(dock, 12, t0 + 200_000);
  touch(dock, u(13), t0);
  const r = sweepIdle(dock, t0 + 300_000);
  assert.deepEqual(r.dropped, [{ userId: 'u13', name: 'U13' }]);
  assert.equal(dock.queue.length, 0);
  assert.equal(seated(dock), 12);
});

test('kick frees seat and pulls from queue on next sweep', () => {
  const dock = createDock(config);
  fill(dock, 12);
  touch(dock, u(13), t0);
  assert.equal(kick(dock, 'u3'), true);
  assert.equal(kick(dock, 'u3'), false);
  assert.equal(dock.seats[2], null);
  const r = sweepIdle(dock, t0 + 1000);
  assert.deepEqual(r.filled, [{ seatIndex: 2, user: u(13) }]);
  assert.equal(seatOf(dock, 'u13'), 2);
});

test('stranger does not jump the queue when a seat is free', () => {
  const dock = createDock(config);
  fill(dock, 12);
  touch(dock, u(13), t0);
  kick(dock, 'u1');
  assert.deepEqual(touch(dock, u(14), t0), { result: 'queued' });
  assert.deepEqual(dock.queue.map((q) => q.user.id), ['u13', 'u14']);
});
