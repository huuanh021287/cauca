import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBatcher } from '../server/app.js';

function setup() {
  const flushed = [];
  const timers = [];
  const schedule = (fn, ms) => { timers.push({ fn, ms }); return timers.length - 1; };
  const b = createBatcher({ batchMs: 200, onFlush: (evs) => flushed.push(evs), schedule });
  return { b, flushed, timers };
}
const u = (id) => ({ id, name: id, avatar: null });

test('coalesces likes per user within window', () => {
  const { b, flushed, timers } = setup();
  b.push({ type: 'like', user: u('a'), count: 3 });
  b.push({ type: 'like', user: u('b'), count: 1 });
  b.push({ type: 'like', user: u('a'), count: 4 });
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, 200);
  timers[0].fn();
  assert.equal(flushed.length, 1);
  assert.deepEqual(flushed[0].map((e) => [e.user.id, e.count]), [['a', 7], ['b', 1]]);
});

test('preserves order of non-like events', () => {
  const { b, flushed } = setup();
  b.push({ type: 'join', user: u('a') });
  b.push({ type: 'like', user: u('a'), count: 1 });
  b.push({ type: 'chat', user: u('b'), text: 'cau' });
  b.push({ type: 'gift', user: u('c'), coins: 5 });
  b.flushNow();
  assert.deepEqual(flushed[0].map((e) => e.type), ['join', 'like', 'chat', 'gift']);
});

test('flushNow empties buffer', () => {
  const { b, flushed } = setup();
  b.push({ type: 'join', user: u('a') });
  b.flushNow();
  b.flushNow();
  assert.equal(flushed.length, 1);
});

test('trimEvents caps, prioritizes and preserves order', async () => {
  const { trimEvents } = await import('../server/app.js');
  const evs = [
    { kind: 'cast' }, { kind: 'catch', tier: 'common' }, { kind: 'gift' }, { kind: 'bite' },
    { kind: 'catch', tier: 'epic' }, { kind: 'level_up' }, { kind: 'cast' },
  ];
  assert.equal(trimEvents(evs, 10), evs);
  const out = trimEvents(evs, 3);
  assert.deepEqual(out.map((e) => e.kind), ['gift', 'catch', 'level_up']);
  assert.equal(out[1].tier, 'epic');
});
