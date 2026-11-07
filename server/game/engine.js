// Bộ máy game: vòng câu của từng ghế và xử lý tương tác của người xem.
// Không dùng Date.now()/Math.random(): `now` (ms) và `rng` được truyền vào.
import { createDock, touch, sweepIdle, kick as dockKick, seatOf } from './dock.js';
import { rollCatch, xpForCatch } from './catch.js';
import { applyXp, titleFor } from './progression.js';
import { leaderboard } from './leaderboard.js';
import { parseCommand } from './commands.js';

export function createGame({ config, players, rng }) {
  const f = config.fishing;
  const sec = (s) => s * 1000;
  const fastGift = config.gifts.find((g) => g.effect === 'fast');
  const dock = createDock(config);
  const session = { kgByUser: new Map(), followed: new Set(), shares: new Map() };
  const pendingBait = new Map(); // userId -> mồi được tặng khi đang chờ chỗ
  const welcomed = new Set();

  const ev = (kind, user, payload = {}) => ({ kind, userId: user.id, name: user.name, ...payload });

  function setPhase(seat, phase, at, durationMs) {
    seat.phase = phase;
    seat.phaseStartedAt = at;
    seat.phaseEndsAt = at + durationMs;
  }

  // Ghế vừa có người ngồi: khởi tạo trạng thái câu và gửi seat/welcome_back.
  function onSeated(index, now, out) {
    const seat = dock.seats[index];
    const { user } = seat;
    const { record, isReturning } = players.getOrCreate(user, now);
    Object.assign(seat, {
      waitTotal: 0, bait: pendingBait.get(user.id) ?? 0, legendary: false,
      fastUntil: 0, reelBonus: false, lastCatch: null,
    });
    pendingBait.delete(user.id);
    setPhase(seat, 'idle', now, sec(f.autoCastDelaySec));
    out.push(ev('seat', user, { seatIndex: index }));
    if (isReturning && !welcomed.has(user.id)) {
      welcomed.add(user.id);
      out.push(ev('welcome_back', user, { level: record.level, title: titleFor(config, record.level).name }));
    }
  }

  // Mọi tương tác đi qua đây. Trả về ghế nếu người này đang ngồi.
  function enter(user, now, out) {
    const r = touch(dock, user, now);
    if (r.result === 'seated') onSeated(r.seatIndex, now, out);
    else if (r.result === 'queued') out.push(ev('queued', user));
    const idx = r.seatIndex ?? -1;
    return idx === -1 ? null : { seat: dock.seats[idx], index: idx };
  }

  function cast(seat, index, at, out) {
    setPhase(seat, 'casting', at, sec(f.castSec));
    out.push(ev('cast', seat.user, { seatIndex: index }));
  }

  function startReeling(seat, at) {
    setPhase(seat, 'reeling', at, sec(f.reelSec));
  }

  function land(seat, index, at, out) {
    const useBait = seat.bait > 0;
    const result = rollCatch(config, { bait: useBait, legendary: seat.legendary, reelBonus: seat.reelBonus }, rng);
    if (useBait) seat.bait -= 1;
    seat.legendary = false;
    seat.reelBonus = false;
    seat.lastCatch = result;
    setPhase(seat, 'result', at, sec(f.resultSec));

    const { user } = seat;
    players.recordCatch(user.id, result, at);
    const record = players.get(user.id);
    const ups = applyXp(config, record, xpForCatch(config, result));
    players.markDirty();
    session.kgByUser.set(user.id, (session.kgByUser.get(user.id) ?? 0) + result.kg);
    out.push(ev('catch', user, { seatIndex: index, ...result }));
    if (ups > 0) {
      out.push(ev('level_up', user, { seatIndex: index, level: record.level, title: titleFor(config, record.level).name }));
    }
  }

  // Chuyển sang phase kế tiếp tại thời điểm `at` (= lúc phase cũ hết hạn).
  function advance(seat, index, at, out) {
    switch (seat.phase) {
      case 'idle':
        cast(seat, index, at, out);
        break;
      case 'casting': {
        const [min, max] = f.waitSec;
        const mult = at < seat.fastUntil ? fastGift.waitMultiplier : 1;
        seat.waitTotal = sec(min + rng() * (max - min)) * mult;
        setPhase(seat, 'waiting', at, seat.waitTotal);
        break;
      }
      case 'waiting':
        setPhase(seat, 'bite', at, sec(f.biteWindowSec));
        out.push(ev('bite', seat.user, { seatIndex: index }));
        break;
      case 'bite':
        startReeling(seat, at); // hết cửa sổ: vẫn kéo lên, không thưởng
        break;
      case 'reeling':
        land(seat, index, at, out);
        break;
      case 'result':
        setPhase(seat, 'idle', at, sec(f.autoCastDelaySec));
        break;
    }
  }

  function giveBait(user, seated, amount) {
    if (seated) seated.seat.bait += amount;
    else pendingBait.set(user.id, (pendingBait.get(user.id) ?? 0) + amount);
  }

  function giftFor(coins) {
    return config.gifts.find((g) => coins >= g.minCoins && (g.maxCoins === null || coins <= g.maxCoins));
  }

  function handle(event, now) {
    const out = [];
    const { user } = event;
    const seated = enter(user, now, out);
    switch (event.type) {
      case 'like': {
        if (!seated || seated.seat.phase !== 'waiting') break;
        const { seat } = seated;
        const floor = seat.phaseStartedAt + seat.waitTotal * f.minWaitRatio;
        const cut = (event.count ?? 1) * sec(f.likeReduceSec);
        seat.phaseEndsAt = Math.max(floor, seat.phaseEndsAt - cut);
        break;
      }
      case 'chat': {
        if (!seated) break;
        const cmd = parseCommand(config, event.text);
        const { seat, index } = seated;
        if (cmd === 'cast' && seat.phase === 'idle') cast(seat, index, now, out);
        else if (cmd === 'reel' && seat.phase === 'bite') {
          seat.reelBonus = true;
          startReeling(seat, now);
        }
        break;
      }
      case 'follow': {
        const r = config.rewards.follow;
        if (session.followed.has(user.id)) break;
        session.followed.add(user.id);
        giveBait(user, seated, r.bait);
        out.push(ev('follow_thanks', user, { bait: r.bait }));
        break;
      }
      case 'share': {
        const r = config.rewards.share;
        const n = session.shares.get(user.id) ?? 0;
        if (n >= r.perSession) break;
        session.shares.set(user.id, n + 1);
        giveBait(user, seated, r.bait);
        out.push(ev('share_thanks', user, { bait: r.bait }));
        break;
      }
      case 'gift': {
        const g = giftFor(event.coins ?? 0);
        if (!g) break;
        if (g.effect === 'bait') giveBait(user, seated, g.bait);
        else if (seated && g.effect === 'fast') {
          const { seat, index } = seated;
          if (seat.phase === 'idle') cast(seat, index, now, out);
          seat.fastUntil = Math.min(Math.max(now, seat.fastUntil) + sec(g.fastSec), now + sec(g.fastMaxSec));
        } else if (seated && g.effect === 'legendary') {
          seated.seat.legendary = true;
        }
        out.push(ev('gift', user, { effect: g.effect, fireworks: g.fireworks }));
        break;
      }
    }
    return out;
  }

  function tick(now) {
    const out = [];
    const { left, filled } = sweepIdle(dock, now);
    for (const l of left) out.push({ kind: 'leave', userId: l.userId, name: l.name, seatIndex: l.seatIndex });
    for (const fl of filled) onSeated(fl.seatIndex, now, out);
    dock.seats.forEach((seat, index) => {
      while (seat !== null && seat.phaseEndsAt <= now) advance(seat, index, seat.phaseEndsAt, out);
    });
    return out;
  }

  function kick(userId, now) {
    const idx = seatOf(dock, userId);
    if (idx === -1) return [];
    const { user } = dock.seats[idx];
    dockKick(dock, userId);
    pendingBait.delete(userId);
    return [ev('leave', user, { seatIndex: idx })];
  }

  function snapshot(now) {
    const seats = dock.seats.map((seat) => {
      if (seat === null) return null;
      const level = players.get(seat.user.id)?.level ?? 1;
      const t = titleFor(config, level);
      return {
        userId: seat.user.id, name: seat.user.name, avatar: seat.user.avatar ?? null,
        level, title: t.name, rodColor: t.rodColor, aura: t.aura,
        phase: seat.phase, phaseEndsAt: seat.phaseEndsAt, bait: seat.bait,
        legendary: seat.legendary, fastUntil: seat.fastUntil, lastCatch: seat.lastCatch,
      };
    });
    return {
      serverNow: now,
      seats,
      queueLength: dock.queue.length,
      leaderboard: leaderboard({ sessionKg: session.kgByUser, store: players, now, top: config.leaderboard.sessionTop }),
    };
  }

  return { handle, tick, kick, snapshot, session, dock };
}
