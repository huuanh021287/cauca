import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../server/config/loadConfig.js';
import { createRng, seqRng } from '../server/game/rng.js';
import { createPlayerStore } from '../server/store/playerStore.js';
import { createGame } from '../server/game/engine.js';

const config = loadConfig();
const T0 = new Date(2026, 10, 7, 12).getTime();
const u = (n) => ({ id: `u${n}`, name: `U${n}`, avatar: null });
const kinds = (evs) => evs.map((e) => e.kind);
const find = (evs, kind) => evs.find((e) => e.kind === kind);
const view = (game, now, i = 0) => game.snapshot(now).seats[i];

const oldRecord = (level, xp = 0) => ({
  name: 'Cũ', avatar: null, xp, level, totalKg: 0, catches: 0, collection: {},
  firstSeen: '2026-11-01T00:00:00.000Z', lastSeen: '2026-11-01T00:00:00.000Z',
});

async function setup({ rng = createRng(42), preload, cfg = config } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cauca-engine-'));
  const file = path.join(dir, 'players.json');
  if (preload) fs.writeFileSync(file, JSON.stringify({ version: 1, players: preload, records: {} }));
  const players = createPlayerStore(file, { log() {} });
  await players.load();
  return { game: createGame({ config: cfg, players, rng }), players };
}

const join = (game, n, now) => game.handle({ type: 'join', user: u(n) }, now);
const chat = (game, n, text, now) => game.handle({ type: 'chat', user: u(n), text }, now);

// Đưa ghế 0 tới phase `bite`: tự quăng ở +2s, chờ bắt đầu ở +3s.
// Trả về mốc thời gian bắt đầu bite.
function toBite(game) {
  join(game, 1, T0);
  game.tick(T0 + 2000);
  game.tick(T0 + 3000);
  const at = view(game, T0 + 3000).phaseEndsAt;
  const evs = game.tick(at);
  assert.ok(find(evs, 'bite'));
  return at;
}

// rng cho một mẻ cá tra 5kg (bậc rare, con đầu tiên, cân nhỏ nhất) khi không có mồi.
const CA_TRA_5KG = [0.8, 0, 0];

// Kéo cần đúng lúc `now` (đã tick tới đó để phase bite bắt đầu).
const reelAt = (game, n, now) => { game.tick(now); return chat(game, n, 'kéo', now); };

test('join seats player and emits seat', async () => {
  const { game } = await setup();
  const evs = join(game, 1, T0);
  assert.deepEqual(kinds(evs), ['seat']);
  assert.equal(evs[0].userId, 'u1');
  assert.equal(evs[0].name, 'U1');
  assert.equal(evs[0].seatIndex, 0);
  const v = view(game, T0);
  assert.equal(v.phase, 'idle');
  assert.equal(v.phaseEndsAt, T0 + 2000);
  assert.equal(v.title, 'Tập sự');
  assert.equal(v.level, 1);
  assert.deepEqual(kinds(join(game, 1, T0 + 10)), []);
});

test('returning player emits welcome_back with level/title', async () => {
  const { game } = await setup({ preload: { u1: oldRecord(7) } });
  const evs = join(game, 1, T0);
  assert.deepEqual(kinds(evs), ['seat', 'welcome_back']);
  const wb = find(evs, 'welcome_back');
  assert.equal(wb.level, 7);
  assert.equal(wb.title, 'Cần thủ làng');
  assert.equal(wb.name, 'U1');
});

test('welcome_back only once per session, also after kick', async () => {
  const { game } = await setup({ preload: { u1: oldRecord(7) } });
  join(game, 1, T0);
  assert.deepEqual(kinds(game.kick('u1', T0 + 1)), ['leave']);
  assert.deepEqual(kinds(join(game, 1, T0 + 2)), ['seat']);
});

test('new player does not get welcome_back', async () => {
  const { game } = await setup();
  assert.ok(!find(join(game, 1, T0), 'welcome_back'));
});

test('idle auto-casts after 2s', async () => {
  const { game } = await setup();
  join(game, 1, T0);
  assert.deepEqual(game.tick(T0 + 1999), []);
  const evs = game.tick(T0 + 2000);
  assert.deepEqual(kinds(evs), ['cast']);
  assert.equal(view(game, T0 + 2000).phase, 'casting');
  assert.equal(view(game, T0 + 2000).phaseEndsAt, T0 + 3000);
});

test('full cycle: cast → wait → bite → miss when not reeled → result → idle', async () => {
  const { game, players } = await setup({ rng: seqRng([0, ...CA_TRA_5KG]) });
  join(game, 1, T0);
  game.tick(T0 + 2000);
  game.tick(T0 + 3000);
  let v = view(game, T0 + 3000);
  assert.equal(v.phase, 'waiting');
  assert.equal(v.phaseEndsAt, T0 + 3000 + 25000);

  assert.deepEqual(kinds(game.tick(T0 + 28000)), ['bite']);
  v = view(game, T0 + 28000);
  assert.equal(v.phase, 'bite');
  assert.equal(v.phaseEndsAt, T0 + 32000);

  const evs = game.tick(T0 + 32000);
  assert.deepEqual(kinds(evs), ['miss']);
  assert.equal(evs[0].seatIndex, 0);
  v = view(game, T0 + 32000);
  assert.equal(v.phase, 'result');
  assert.equal(v.lastCatch, null);
  assert.equal(v.phaseEndsAt, T0 + 35000);
  assert.equal(players.get('u1').catches ?? 0, 0);

  assert.deepEqual(kinds(game.tick(T0 + 35000)), []);
  v = view(game, T0 + 35000);
  assert.equal(v.phase, 'idle');
  assert.equal(v.phaseEndsAt, T0 + 37000);
});

test('full cycle: cast → wait → bite → reel → result → idle', async () => {
  const { game, players } = await setup({ rng: seqRng([0, ...CA_TRA_5KG]) });
  join(game, 1, T0);
  game.tick(T0 + 2000);
  game.tick(T0 + 3000);
  assert.deepEqual(kinds(game.tick(T0 + 28000)), ['bite']);
  assert.deepEqual(chat(game, 1, 'kéo', T0 + 28500), []);
  let v = view(game, T0 + 28500);
  assert.equal(v.phase, 'reeling');
  assert.equal(v.phaseEndsAt, T0 + 30000);

  const evs = game.tick(T0 + 30000);
  const c = find(evs, 'catch');
  assert.deepEqual(
    { fishId: c.fishId, fishName: c.fishName, tier: c.tier, kg: c.kg },
    { fishId: 'ca_tra', fishName: 'Cá tra khổng lồ', tier: 'rare', kg: 5 },
  );
  assert.equal(c.userId, 'u1');
  v = view(game, T0 + 30000);
  assert.equal(v.phase, 'result');
  assert.equal(v.phaseEndsAt, T0 + 33000);
  assert.equal(players.get('u1').catches, 1);
});
test('large time jump advances several phases in one tick', async () => {
  const { game } = await setup({ rng: seqRng([0, ...CA_TRA_5KG]) });
  join(game, 1, T0);
  const evs = game.tick(T0 + 36500);
  assert.deepEqual(kinds(evs), ['cast', 'bite', 'miss']);
  assert.equal(view(game, T0 + 36500).phase, 'idle');
});
test('likes shorten wait by 0.3s each, floored at 50%', async () => {
  const { game } = await setup({ rng: seqRng([1 / 3]) });
  join(game, 1, T0);
  game.tick(T0 + 2000);
  game.tick(T0 + 3000);
  const start = T0 + 3000;
  assert.equal(view(game, start).phaseEndsAt, start + 30000);
  game.handle({ type: 'like', user: u(1), count: 10 }, start + 100);
  assert.equal(view(game, start + 100).phaseEndsAt, start + 27000);
  game.handle({ type: 'like', user: u(1), count: 1000 }, start + 200);
  assert.equal(view(game, start + 200).phaseEndsAt, start + 15000);
});

test('likes do nothing outside waiting', async () => {
  const { game } = await setup();
  join(game, 1, T0);
  game.handle({ type: 'like', user: u(1), count: 100 }, T0 + 10);
  assert.equal(view(game, T0 + 10).phaseEndsAt, T0 + 2000);
});

test('chat "câu" casts immediately when idle; ignored when waiting', async () => {
  const { game } = await setup({ rng: seqRng([0]) });
  join(game, 1, T0);
  const evs = chat(game, 1, 'Câu!!', T0 + 500);
  assert.deepEqual(kinds(evs), ['cast']);
  assert.equal(view(game, T0 + 500).phase, 'casting');
  assert.equal(view(game, T0 + 500).phaseEndsAt, T0 + 1500);
  game.tick(T0 + 1500);
  assert.equal(view(game, T0 + 1500).phase, 'waiting');
  const ends = view(game, T0 + 1500).phaseEndsAt;
  assert.deepEqual(chat(game, 1, 'câu', T0 + 2000), []);
  assert.equal(view(game, T0 + 2000).phase, 'waiting');
  assert.equal(view(game, T0 + 2000).phaseEndsAt, ends);
});

test('chat "kéo" during bite sets reelBonus and moves to reeling now', async () => {
  const { game } = await setup({ rng: seqRng([0, ...CA_TRA_5KG]) });
  const biteAt = toBite(game);
  const now = biteAt + 1000;
  assert.deepEqual(chat(game, 1, 'kéo', now), []);
  const v = view(game, now);
  assert.equal(v.phase, 'reeling');
  assert.equal(v.phaseEndsAt, now + 1500);
  const c = find(game.tick(now + 1500), 'catch');
  assert.equal(c.kg, 6); // 5kg × 1.2
});

test('chat "kéo" outside bite is ignored', async () => {
  const { game } = await setup();
  join(game, 1, T0);
  assert.deepEqual(chat(game, 1, 'kéo', T0 + 10), []);
  assert.equal(view(game, T0 + 10).phase, 'idle');
});

test('bite window expiry: fish escapes, no catch, bait kept', async () => {
  const { game } = await setup({ rng: seqRng([0, ...CA_TRA_5KG]) });
  join(game, 1, T0);
  game.handle({ type: 'follow', user: u(1) }, T0 + 1);
  const biteAt = toBite(game);
  const evs = game.tick(biteAt + 4000);
  assert.deepEqual(kinds(evs), ['miss']);
  assert.equal(view(game, biteAt + 4000).phase, 'result');
  assert.equal(view(game, biteAt + 4000).bait, 5);
  assert.equal(game.session.kgByUser.get('u1') ?? 0, 0);
});

test('reel inside the sweet window grants 1.2× kg; outside it does not', async () => {
  // Lượt quay chờ = 0 → vùng canh nhịp 28800–29600 ms (cửa sổ cắn 28000–32000).
  const inside = await setup({ rng: seqRng([0, ...CA_TRA_5KG]) });
  join(inside.game, 1, T0);
  inside.game.tick(T0 + 28000);
  chat(inside.game, 1, 'kéo', T0 + 29000);
  assert.equal(find(inside.game.tick(T0 + 30500), 'catch').kg, 6);

  const outside = await setup({ rng: seqRng([0, ...CA_TRA_5KG]) });
  join(outside.game, 1, T0);
  outside.game.tick(T0 + 28000);
  chat(outside.game, 1, 'kéo', T0 + 28300);
  assert.equal(find(outside.game.tick(T0 + 29800), 'catch').kg, 5);
});
test('follow grants 5 bait once per session', async () => {
  const { game } = await setup();
  join(game, 1, T0);
  const a = game.handle({ type: 'follow', user: u(1) }, T0 + 1);
  const b = game.handle({ type: 'follow', user: u(1) }, T0 + 2);
  assert.deepEqual(kinds(a), ['follow_thanks']);
  assert.equal(a[0].bait, 5);
  assert.deepEqual(b, []);
  assert.equal(view(game, T0 + 2).bait, 5);
  assert.ok(game.session.followed.has('u1'));
});

test('share grants 3 bait up to 3 times', async () => {
  const { game } = await setup();
  join(game, 1, T0);
  const all = [];
  for (let i = 1; i <= 4; i++) all.push(...game.handle({ type: 'share', user: u(1) }, T0 + i));
  assert.deepEqual(kinds(all), ['share_thanks', 'share_thanks', 'share_thanks']);
  assert.equal(all[0].bait, 3);
  assert.equal(view(game, T0 + 5).bait, 9);
  assert.equal(game.session.shares.get('u1'), 3);
});

test('bait consumed one per catch and passed to rollCatch', async () => {
  // Với mồi: rare 44, epic 14 → roll 90 rơi vào epic (không mồi thì là rare).
  const { game } = await setup({ rng: seqRng([0, 0.9, 0, 0]) });
  join(game, 1, T0);
  game.handle({ type: 'follow', user: u(1) }, T0 + 1);
  const evs = [...reelAt(game, 1, T0 + 28500), ...game.tick(T0 + 33500)];
  const c = find(evs, 'catch');
  assert.equal(c.tier, 'epic');
  assert.equal(c.fishId, 'ca_koi');
  assert.equal(view(game, T0 + 33500).bait, 4);
});

test('gift 5 coins → fast 60s, wait ×0.5; stacking capped at 300s', async () => {
  const { game } = await setup({ rng: seqRng([0]) });
  join(game, 1, T0);
  const evs = game.handle({ type: 'gift', user: u(1), coins: 5 }, T0 + 100);
  assert.deepEqual(kinds(evs), ['cast', 'gift']);
  assert.equal(find(evs, 'gift').effect, 'fast');
  let v = view(game, T0 + 100);
  assert.equal(v.phase, 'casting');
  assert.equal(v.fastUntil, T0 + 100 + 60000);
  game.tick(T0 + 1100);
  v = view(game, T0 + 1100);
  assert.equal(v.phase, 'waiting');
  assert.equal(v.phaseEndsAt, T0 + 1100 + 12500); // 25s × 0.5

  game.handle({ type: 'gift', user: u(1), coins: 5 }, T0 + 2000);
  assert.equal(view(game, T0 + 2000).fastUntil, T0 + 100 + 120000);
  for (let i = 0; i < 10; i++) game.handle({ type: 'gift', user: u(1), coins: 5 }, T0 + 3000);
  assert.equal(view(game, T0 + 3000).fastUntil, T0 + 3000 + 300000);
});

test('gift 50 coins → +10 bait, gift event fireworks small', async () => {
  const { game } = await setup();
  join(game, 1, T0);
  const evs = game.handle({ type: 'gift', user: u(1), coins: 50 }, T0 + 1);
  assert.deepEqual(kinds(evs), ['gift']);
  assert.equal(evs[0].effect, 'bait');
  assert.equal(evs[0].fireworks, 'small');
  assert.equal(view(game, T0 + 1).bait, 10);
  assert.equal(view(game, T0 + 1).phase, 'idle');
});

test('gift 500 coins → legendary flag for next catch only, then cleared', async () => {
  // roll 99.5: có cờ thì ra legendary, không cờ thì ra epic.
  const { game } = await setup({ rng: seqRng([0, 0.995, 0, 0, 0, 0.995, 0, 0, 0, 0, 0, 0]) });
  join(game, 1, T0);
  const evs = game.handle({ type: 'gift', user: u(1), coins: 500 }, T0 + 1);
  assert.equal(evs[0].effect, 'legendary');
  assert.equal(evs[0].fireworks, 'big');
  assert.equal(view(game, T0 + 1).legendary, true);
  const first = find(reelAt(game, 1, T0 + 28500).concat(game.tick(T0 + 33500)), 'catch');
  assert.equal(first.tier, 'legendary');
  assert.equal(view(game, T0 + 33500).legendary, false);
  // Vòng 2: idle +3s, tự quăng +2s, casting +1s, chờ 25s, bite 4s, kéo 1.5s.
  const second = find(reelAt(game, 1, T0 + 33500 + 28500).concat(game.tick(T0 + 33500 + 36500)), 'catch');
  assert.equal(second.tier, 'epic');
});

test('interaction from unseated user seats them', async () => {
  const { game } = await setup();
  const evs = game.handle({ type: 'like', user: u(5), count: 3 }, T0);
  assert.deepEqual(kinds(evs), ['seat']);
  assert.equal(view(game, T0).userId, 'u5');
});

test('level_up emitted with new title', async () => {
  // Cấp 4 cần 400 xp; có sẵn 390 + 50 từ cá tra 5kg → cấp 5.
  const { game, players } = await setup({ rng: seqRng([0, ...CA_TRA_5KG]), preload: { u1: oldRecord(4, 390) } });
  join(game, 1, T0);
  const evs = reelAt(game, 1, T0 + 28500).concat(game.tick(T0 + 33500));
  const lu = find(evs, 'level_up');
  assert.equal(lu.level, 5);
  assert.equal(lu.title, 'Cần thủ làng');
  assert.equal(lu.userId, 'u1');
  assert.equal(players.get('u1').xp, 40);
  assert.equal(view(game, T0 + 33500).title, 'Cần thủ làng');
});

test('kicked during reeling then chats: no crash, no catch recorded, re-seated fresh', async () => {
  const { game, players } = await setup({ rng: seqRng([0, ...CA_TRA_5KG]) });
  join(game, 1, T0);
  game.handle({ type: 'follow', user: u(1) }, T0 + 1);
  reelAt(game, 1, T0 + 28500);
  assert.equal(view(game, T0 + 28600).phase, 'reeling');
  const kicked = game.kick('u1', T0 + 28600);
  assert.deepEqual(kinds(kicked), ['leave']);
  assert.equal(kicked[0].seatIndex, 0);
  assert.equal(view(game, T0 + 32100), null);
  assert.deepEqual(game.tick(T0 + 33500), []);
  const evs = chat(game, 1, 'kéo', T0 + 33600);
  assert.deepEqual(kinds(evs), ['seat']);
  const v = view(game, T0 + 33600);
  assert.equal(v.phase, 'idle');
  assert.equal(v.bait, 0);
  assert.equal(v.lastCatch, null);
  assert.equal(players.get('u1').catches, 0);
  assert.deepEqual(game.kick('u1', T0 + 33700).length, 1);
  assert.deepEqual(game.kick('u1', T0 + 33800), []);
});

test('idle 300s via tick emits leave and seats queued player', async () => {
  const { game } = await setup({ rng: createRng(42) });
  for (let i = 1; i <= 12; i++) join(game, i, T0);
  const q = join(game, 13, T0);
  assert.deepEqual(kinds(q), ['queued']);
  assert.equal(game.snapshot(T0).queueLength, 1);
  for (let i = 2; i <= 13; i++) game.handle({ type: 'like', user: u(i), count: 1 }, T0 + 200000);
  const evs = game.tick(T0 + 300000).filter((e) => e.kind === 'leave' || e.kind === 'seat');
  assert.deepEqual(evs.map((e) => [e.kind, e.userId, e.seatIndex]), [['leave', 'u1', 0], ['seat', 'u13', 0]]);
  const v = view(game, T0 + 300000);
  assert.equal(v.userId, 'u13');
  assert.equal(v.phase, 'idle');
  assert.equal(game.snapshot(T0 + 300000).queueLength, 0);
});

test('queued user follow: thanks now, bait applied when seated', async () => {
  const { game } = await setup({ rng: createRng(1) });
  for (let i = 1; i <= 12; i++) join(game, i, T0);
  join(game, 13, T0);
  const evs = game.handle({ type: 'follow', user: u(13) }, T0 + 1);
  assert.deepEqual(kinds(evs), ['follow_thanks']);
  game.kick('u1', T0 + 2);
  const t = game.tick(T0 + 3);
  assert.ok(t.some((e) => e.kind === 'seat' && e.userId === 'u13'));
  assert.equal(view(game, T0 + 3).bait, 5);
});

const oneSeat = { ...config, dock: { ...config.dock, seats: 1 } };

// u1 ngồi ghế duy nhất, u2 xếp hàng và tặng quà, rồi u1 bị kick để u2 vào ghế ở T0+2.
async function queuedGift(coins, rng) {
  const ctx = await setup({ cfg: oneSeat, rng });
  join(ctx.game, 1, T0);
  assert.deepEqual(kinds(join(ctx.game, 2, T0)), ['queued']);
  const evs = ctx.game.handle({ type: 'gift', user: u(2), coins }, T0 + 1);
  assert.deepEqual(kinds(evs), ['gift']);
  ctx.game.kick('u1', T0 + 1);
  assert.ok(ctx.game.tick(T0 + 2).some((e) => e.kind === 'seat' && e.userId === 'u2'));
  return ctx;
}

test('queued user gifts 500 coins: legendary applied when seated', async () => {
  const { game } = await queuedGift(500, seqRng([0, 0.995, 0, 0]));
  assert.equal(view(game, T0 + 2).legendary, true);
  const c = find(reelAt(game, 2, T0 + 2 + 28500).concat(game.tick(T0 + 2 + 33500)), 'catch');
  assert.equal(c.tier, 'legendary');
  assert.equal(view(game, T0 + 2 + 33500).legendary, false);
});

test('queued user gifts 5 coins: fast applied when seated, capped', async () => {
  const { game } = await queuedGift(5);
  assert.equal(view(game, T0 + 2).fastUntil, T0 + 2 + 60000);
  assert.equal(view(game, T0 + 2).phase, 'idle');

  const ctx = await setup({ cfg: oneSeat });
  join(ctx.game, 1, T0);
  join(ctx.game, 2, T0);
  for (let i = 0; i < 10; i++) ctx.game.handle({ type: 'gift', user: u(2), coins: 5 }, T0 + 1);
  ctx.game.kick('u1', T0 + 1);
  ctx.game.tick(T0 + 2);
  assert.equal(view(ctx.game, T0 + 2).fastUntil, T0 + 2 + 300000);
});

test('gift event fireworks is null when gift has none', async () => {
  const { game } = await setup();
  join(game, 1, T0);
  const g = find(game.handle({ type: 'gift', user: u(1), coins: 5 }, T0 + 1), 'gift');
  assert.equal(g.fireworks, null);
});

test('session kg accumulates per user', async () => {
  const { game } = await setup({ rng: createRng(7) });
  join(game, 1, T0);
  join(game, 2, T0);
  const kg = { u1: 0, u2: 0 };
  let catches = 0;
  for (let now = T0; now < T0 + 200000; now += 250) {
    for (const e of game.tick(now)) {
      if (e.kind === 'catch') { kg[e.userId] += e.kg; catches++; }
    }
    game.handle({ type: 'chat', user: u(1), text: 'kéo' }, now);
    game.handle({ type: 'chat', user: u(2), text: 'kéo' }, now);
    if ((now - T0) % 60000 === 0) { // giữ chỗ
      game.handle({ type: 'like', user: u(1) }, now);
      game.handle({ type: 'like', user: u(2) }, now);
    }
  }
  assert.ok(catches >= 4);
  for (const id of ['u1', 'u2']) {
    assert.ok(Math.abs(game.session.kgByUser.get(id) - kg[id]) < 1e-9);
  }
  const lb = game.snapshot(T0 + 200000).leaderboard;
  assert.ok(lb.session.length <= config.leaderboard.sessionTop);
  assert.ok('today' in lb);
});

test('snapshot shape', async () => {
  const { game } = await setup();
  join(game, 1, T0);
  const s = game.snapshot(T0);
  assert.equal(s.serverNow, T0);
  assert.equal(s.seats.length, config.dock.seats);
  assert.equal(s.seats[1], null);
  assert.deepEqual(Object.keys(s.seats[0]).sort(), [
    'aura', 'avatar', 'bait', 'fastUntil', 'lastCatch', 'legendary', 'level', 'name',
    'phase', 'phaseEndsAt', 'phaseStartedAt', 'rodColor', 'sweetEnd', 'sweetStart', 'title', 'userId',
  ]);
  assert.equal(s.seats[0].phaseStartedAt, T0);
  assert.ok(s.seats[0].phaseEndsAt > s.seats[0].phaseStartedAt);
  assert.deepEqual(s.leaderboard, { session: [], today: null });
});

test('fast gift while waiting shortens remaining wait now, floored at minWaitRatio', async () => {
  const { game } = await setup({ rng: seqRng([0]) });
  join(game, 1, T0);
  game.tick(T0 + 2000);
  game.tick(T0 + 3000);
  let v = view(game, T0 + 3000);
  assert.equal(v.phase, 'waiting');
  assert.equal(v.phaseEndsAt, T0 + 28000); // chờ 25s
  game.handle({ type: 'gift', user: u(1), coins: 5 }, T0 + 5000);
  v = view(game, T0 + 5000);
  assert.equal(v.phase, 'waiting');
  assert.equal(v.phaseEndsAt, T0 + 5000 + 11500); // còn 23s × 0.5
  game.handle({ type: 'gift', user: u(1), coins: 5 }, T0 + 6000);
  assert.equal(view(game, T0 + 6000).phaseEndsAt, T0 + 3000 + 12500); // sàn 50% của 25s
});
