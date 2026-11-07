import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSimulator } from '../server/sim/simulator.js';
import { createRng } from '../server/game/rng.js';

const sim = () => createSimulator({ rng: createRng(7) });

test('join20 yields 20 distinct users', () => {
  const evs = sim().make('join20', {}, []);
  assert.equal(evs.length, 20);
  assert.ok(evs.every((e) => e.type === 'join' && /^sim_\d+$/.test(e.user.id) && e.user.avatar === null));
  assert.equal(new Set(evs.map((e) => e.user.id)).size, 20);
  assert.equal(new Set(evs.map((e) => e.user.name)).size, 20);
});

test('chatCast picks a seated user', () => {
  const seated = [{ id: 'sim_900', name: 'Thu Hà', avatar: null }, { id: 'sim_901', name: 'Lan Chi', avatar: null }];
  const [ev] = sim().make('chatCast', {}, seated);
  assert.equal(ev.type, 'chat');
  assert.ok(seated.some((s) => s.id === ev.user.id));
  assert.equal(ev.text, 'cau');
});

test('gift carries coins and likes500 carries count', () => {
  const s = sim();
  assert.equal(s.make('gift', { coins: 42 }, [])[0].coins, 42);
  assert.equal(s.make('likes500', {}, [])[0].count, 500);
});

test('storm emits about 3000 likes/min', () => {
  const s = sim();
  const queue = [];
  const schedule = (fn, ms) => { queue.push({ fn, ms }); return queue.length; };
  const events = [];
  s.storm({ durationSec: 60, users: 50, likesPerMin: 3000 }, (e) => events.push(e), schedule);
  let guard = 0;
  while (queue.length && guard++ < 10000) queue.shift().fn();
  const likes = events.filter((e) => e.type === 'like').reduce((n, e) => n + e.count, 0);
  assert.ok(likes >= 2900 && likes <= 3100, `likes=${likes}`);
  assert.equal(new Set(events.map((e) => e.user.id)).size, 50);
});

test('storm stop halts emission', () => {
  const s = sim();
  const queue = [];
  const events = [];
  const stop = s.storm({ durationSec: 60, users: 5, likesPerMin: 600 }, (e) => events.push(e), (fn, ms) => { queue.push(fn); return 1; });
  queue.shift()();
  const n = events.length;
  stop();
  while (queue.length) queue.shift()();
  assert.equal(events.length, n);
});
