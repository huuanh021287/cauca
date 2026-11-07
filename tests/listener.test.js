import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createListener } from '../server/tiktok/listener.js';

const config = { ui: { nameMaxChars: 12 } };

class FakeConn extends EventEmitter {
  constructor(behavior) {
    super();
    this.behavior = behavior; // hàm () => Promise
    this.disconnected = 0;
  }
  connect() { return this.behavior(); }
  disconnect() { this.disconnected += 1; return Promise.resolve(); }
}

function setup(behaviors, factoryError) {
  const conns = [];
  const usernames = [];
  const events = [];
  const statuses = [];
  const timers = [];
  const cancelled = [];
  const connect = (u) => {
    usernames.push(u);
    if (factoryError) throw factoryError;
    const b = behaviors[Math.min(conns.length, behaviors.length - 1)];
    const c = new FakeConn(b);
    conns.push(c);
    return c;
  };
  const schedule = (fn, ms) => { const t = { fn, ms }; timers.push(t); return t; };
  const cancel = (t) => cancelled.push(t);
  const listener = createListener({
    config, connect, schedule, cancel,
    onEvent: (e) => events.push(e),
    onStatus: (s) => statuses.push(s),
  });
  return { listener, conns, usernames, events, statuses, timers, cancelled };
}

const ok = () => Promise.resolve();
const fail = (msg) => () => Promise.reject(new Error(msg));
const tick = () => new Promise((r) => setImmediate(r));
const last = (a) => a[a.length - 1];

test('connected status and events forwarded', async () => {
  const t = setup([ok]);
  t.listener.start('@Streamer ');
  await tick();
  assert.deepEqual(t.usernames, ['Streamer']);
  assert.deepEqual(t.statuses.map((s) => s.tiktok), ['connecting', 'connected']);
  t.conns[0].emit('chat', { user: { id: '1', nickname: 'An' }, content: 'hi' });
  t.conns[0].emit('roomUser', { x: 1 });
  assert.equal(t.events.length, 1);
  assert.equal(t.events[0].type, 'chat');
  assert.equal(t.events[0].text, 'hi');
});

test('disconnect triggers retry delays 5000,10000,30000,30000', async () => {
  const t = setup([fail('boom')]);
  t.listener.start('abc');
  await tick();
  assert.equal(last(t.statuses).tiktok, 'retrying');
  for (let i = 0; i < 4; i++) {
    t.timers[i].fn();
    await tick();
  }
  assert.deepEqual(t.timers.map((x) => x.ms), [5000, 10000, 30000, 30000, 30000]);
});

test('disconnected / streamEnd events trigger a single retry', async () => {
  const t = setup([ok]);
  t.listener.start('abc');
  await tick();
  t.conns[0].emit('streamEnd');
  t.conns[0].emit('disconnected');
  assert.equal(t.timers.length, 1);
  assert.equal(t.timers[0].ms, 5000);
  assert.equal(last(t.statuses).tiktok, 'retrying');
});

test('offline error → not_live status, retries every 30s', async () => {
  for (const msg of ["User is offline", "The user isn't online", 'LIVE has ended']) {
    const t = setup([fail(msg)]);
    t.listener.start('abc');
    await tick();
    assert.equal(last(t.statuses).tiktok, 'not_live', msg);
    assert.match(last(t.statuses).message, /30 giây/);
    assert.equal(t.timers[0].ms, 30000);
  }
});

test('stop cancels pending retry and disconnects', async () => {
  const t = setup([fail('boom')]);
  t.listener.start('abc');
  await tick();
  const pending = t.timers[0];
  t.listener.stop();
  assert.deepEqual(t.cancelled, [pending]);
  assert.equal(t.conns[0].disconnected, 1);
  assert.equal(last(t.statuses).tiktok, 'offline');
  // sự kiện muộn của kết nối cũ bị bỏ qua
  t.conns[0].emit('chat', { user: { id: '1', nickname: 'An' }, content: 'x' });
  t.conns[0].emit('disconnected');
  assert.equal(t.events.length, 0);
  assert.equal(t.timers.length, 1);
});

test('success resets backoff', async () => {
  const seq = [fail('x'), fail('x'), ok, fail('x')];
  let i = 0;
  const t = setup([() => seq[i++]()]);
  t.listener.start('abc');
  await tick();
  t.timers[0].fn(); await tick();   // thất bại lần 2 → 10000
  t.timers[1].fn(); await tick();   // thành công
  assert.equal(last(t.statuses).tiktok, 'connected');
  t.conns[2].emit('disconnected');  // rớt → lại 5000
  assert.deepEqual(t.timers.map((x) => x.ms), [5000, 10000, 5000]);
});

test('start while running stops the previous connection', async () => {
  const t = setup([ok]);
  t.listener.start('a');
  await tick();
  t.listener.start('b');
  await tick();
  assert.equal(t.conns[0].disconnected, 1);
  assert.deepEqual(t.usernames, ['a', 'b']);
  t.conns[0].emit('chat', { user: { id: '1', nickname: 'An' }, content: 'x' });
  assert.equal(t.events.length, 0);
});

test('empty username → error status, no connection', () => {
  const t = setup([ok]);
  t.listener.start('  @ ');
  assert.equal(last(t.statuses).tiktok, 'error');
  assert.equal(t.conns.length, 0);
});

test('factory throwing invalid-id error → error status, no retry', () => {
  const e = new Error('Invalid unique id');
  e.name = 'InvalidUniqueIdError';
  const t = setup([ok], e);
  t.listener.start('bad name');
  assert.equal(last(t.statuses).tiktok, 'error');
  assert.equal(t.timers.length, 0);
});

test('factory throwing generic error → retrying 5000', () => {
  const t = setup([ok], new Error('boom'));
  t.listener.start('abc');
  assert.equal(last(t.statuses).tiktok, 'retrying');
  assert.equal(t.timers[0].ms, 5000);
});

test('stale connect resolving after stop disconnects the orphan', async () => {
  let resolve;
  const t = setup([() => new Promise((r) => { resolve = r; })]);
  t.listener.start('abc');
  t.listener.stop();
  await tick();
  assert.equal(t.conns[0].disconnected, 1);
  resolve();
  await tick();
  assert.equal(t.conns[0].disconnected, 2);
  assert.equal(last(t.statuses).tiktok, 'offline');
});
