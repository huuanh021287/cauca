import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSimulator } from '../server/sim/simulator.js';
import { createRng } from '../server/game/rng.js';

const sim = () => createSimulator({ rng: createRng(7) });

test('join20 yields 20 distinct users', () => {
  const evs = sim().make('join20', {}, []);
  assert.equal(evs.length, 20);
  assert.ok(evs.every((e) => e.type === 'join' && /^sim_[a-z0-9]+_\d+$/.test(e.user.id) && e.user.avatar === null));
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

test('sim ids are unique across launches', () => {
  const a = createSimulator({ rng: createRng(7), launchId: 'aaa' }).make('join1')[0].user.id;
  const b = createSimulator({ rng: createRng(7), launchId: 'bbb' }).make('join1')[0].user.id;
  assert.notEqual(a, b);
  assert.ok(a.startsWith('sim_'));
  const c = createSimulator({ rng: createRng(7) }).make('join1')[0].user.id;
  assert.match(c, /^sim_[a-z0-9]+_1$/);
});

test('follow/share/gift/chat pick only seated sim_ users, never real viewers', () => {
  const s = sim();
  const real = [{ id: '7012345', name: 'Khán giả thật', avatar: null }];
  for (const kind of ['follow', 'share', 'gift', 'chatCast', 'chatReel', 'likes500']) {
    const [ev] = s.make(kind, { coins: 5 }, real);
    assert.ok(ev.user.id.startsWith('sim_'), `${kind} -> ${ev.user.id}`);
  }
  const mixed = [...real, { id: 'sim_x_9', name: 'Giả', avatar: null }];
  for (let i = 0; i < 10; i++) assert.equal(s.make('follow', {}, mixed)[0].user.id, 'sim_x_9');
});

function runStorm(s, opts) {
  const queue = [];
  const events = [];
  s.storm(opts, (e) => events.push(e), (fn) => { queue.push(fn); return queue.length; });
  let guard = 0;
  while (queue.length && guard++ < 10000) queue.shift()();
  return events;
}

test('storm also sends chat commands from crowd members and a gift about every 5s', () => {
  const s = createSimulator({ rng: createRng(3), commands: { cast: 'thacan', reel: 'giat' } });
  const events = runStorm(s, { durationSec: 60, users: 50, likesPerMin: 3000 });
  const crowd = new Set(events.filter((e) => e.type === 'join').map((e) => e.user.id));
  const chats = events.filter((e) => e.type === 'chat');
  const gifts = events.filter((e) => e.type === 'gift');
  // 120 bước × 2 chat
  assert.equal(chats.length, 240);
  assert.ok(chats.every((e) => ['thacan', 'giat'].includes(e.text) && crowd.has(e.user.id)));
  assert.ok(chats.some((e) => e.text === 'thacan') && chats.some((e) => e.text === 'giat'));
  assert.equal(gifts.length, 12);
  assert.ok(gifts.every((e) => [1, 50, 500].includes(e.coins) && crowd.has(e.user.id)));
});

test('storm gift coins are weighted: mostly 1, sometimes 50, rarely 500', () => {
  const s = createSimulator({ rng: createRng(11) });
  const gifts = runStorm(s, { durationSec: 3000, users: 10, likesPerMin: 60 }).filter((e) => e.type === 'gift');
  assert.equal(gifts.length, 600);
  const n = (c) => gifts.filter((g) => g.coins === c).length;
  assert.ok(n(1) > 400, `1 xu: ${n(1)}`);
  assert.ok(n(50) > 30 && n(50) < 150, `50 xu: ${n(50)}`);
  assert.ok(n(500) > 0 && n(500) < n(50), `500 xu: ${n(500)}`);
});
