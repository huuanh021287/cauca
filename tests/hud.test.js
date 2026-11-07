import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatKg, formatClock, shortName, feedText, popupContent, createPopupQueue, createFeed,
  leaderboardView, hintAt, HINTS, queueText,
} from '../public/game/hudLogic.js';

test('formatKg rounds to one decimal', () => {
  assert.equal(formatKg(54.25), '54.3');
  assert.equal(formatKg(2.3), '2.3');
  assert.equal(formatKg(12), '12.0');
  assert.equal(formatKg(0.04), '0.0');
  assert.equal(formatKg('x'), '0.0');
});

test('formatClock is HH:MM zero-padded', () => {
  assert.equal(formatClock(new Date(2026, 10, 7, 7, 5)), '07:05');
  assert.equal(formatClock(new Date(2026, 10, 7, 21, 30)), '21:30');
});

test('shortName uses the server rule: graphemes, max + "…", idempotent on sanitized names', async () => {
  const { sanitizeName } = await import('../server/events/sanitize.js');
  assert.equal(shortName('Đức  Thắng'), 'Đức Thắng');
  assert.equal(shortName('abcdefghijklmnop', 12), 'abcdefghijkl…');
  assert.equal(shortName('😀'.repeat(20), 12), `${'😀'.repeat(12)}…`);
  const family = '👨‍👩‍👧';
  assert.equal(shortName(family.repeat(13), 12), `${family.repeat(12)}…`);
  for (const raw of ['abcdefghijklmnop', 'Nguyễn Thị Minh Khai Hà Nội', '😀'.repeat(20), 'An']) {
    const s = sanitizeName(raw, 12);
    assert.equal(shortName(s, 12), s);
  }
  assert.equal(shortName('   '), 'ẩn danh');
});

test('feedText covers display events with brief copy', () => {
  const u = { userId: 'u1', name: 'Lan Chi' };
  assert.equal(feedText({ ...u, kind: 'seat' }), '@Lan Chi vừa vào bến');
  assert.equal(feedText({ ...u, kind: 'leave' }), '@Lan Chi đã về nhà');
  assert.equal(feedText({ ...u, kind: 'welcome_back', level: 35, title: 'Đại sư biển cả' }),
    'Chào mừng Đại sư biển cả cấp 35 @Lan Chi quay lại!');
  assert.equal(feedText({ ...u, kind: 'level_up', level: 50, title: 'Thần câu' }), '@Lan Chi lên cấp 50 — Thần câu!');
  assert.equal(feedText({ ...u, kind: 'follow_thanks', bait: 5 }), 'Cảm ơn @Lan Chi đã follow! +5 mồi thơm');
  assert.equal(feedText({ ...u, kind: 'share_thanks', bait: 3 }), 'Cảm ơn @Lan Chi đã chia sẻ! +3 mồi thơm');
  assert.match(feedText({ ...u, kind: 'gift', effect: 'legendary', fireworks: 'big' }), /Huyền thoại/);
  assert.match(feedText({ ...u, kind: 'gift', effect: 'fast', fireworks: null }), /câu nhanh/);
  for (const kind of ['cast', 'bite', 'catch', 'queued', 'miss']) assert.equal(feedText({ ...u, kind }), null);
});

test('popupContent: fish shows upper name and kg, trash shows joke', () => {
  const fish = popupContent({ kind: 'catch', userId: 'u', name: 'Minh', fishId: 'ca_loc', fishName: 'Cá lóc', tier: 'common', kg: 2.3 });
  assert.equal(fish.line1, '@Minh câu được');
  assert.equal(fish.line2, 'CÁ LÓC 2.3kg!');
  assert.equal(fish.joke, null);
  const leg = popupContent({ kind: 'catch', userId: 'u', name: 'Minh', fishId: 'x', fishName: 'Cá chép hóa rồng', tier: 'legendary', kg: 88.04 });
  assert.equal(leg.line2, 'CÁ CHÉP HÓA RỒNG 88.0kg!');
  const trash = popupContent({ kind: 'catch', userId: 'u', name: 'Minh', fishId: 'dep_to_ong', fishName: 'Dép tổ ong', tier: 'trash', kg: 0 });
  assert.equal(trash.line1, '@Minh câu được…');
  assert.equal(trash.line2, 'DÉP TỔ ONG');
  assert.equal(typeof trash.joke, 'string');
});

test('popup queue shows at most maxVisible, each for durationMs', () => {
  const q = createPopupQueue({ maxVisible: 2, durationMs: 3000 });
  for (let i = 0; i < 5; i++) q.push({ tier: 'common', n: i }, 0);
  assert.equal(q.active.length, 2);
  assert.deepEqual(q.active.map((p) => p.n), [0, 1]);
  q.update(2999);
  assert.equal(q.active.length, 2);
  const started = q.update(3000);
  assert.deepEqual(started.map((p) => p.n), [2, 3]);
  assert.deepEqual(q.active.map((p) => p.n), [2, 3]);
});

test('popup started during push is still reported by the next update', () => {
  const q = createPopupQueue({ maxVisible: 2, durationMs: 3000 });
  q.push({ tier: 'legendary', n: 'L' }, 0);
  assert.deepEqual(q.update(10).map((p) => p.n), ['L']);
  assert.deepEqual(q.update(20), []);
});

test('popup queue serves higher tiers first', () => {
  const q = createPopupQueue({ maxVisible: 1, durationMs: 1000 });
  q.push({ tier: 'common', n: 'a' }, 0);
  q.push({ tier: 'trash', n: 'b' }, 0);
  q.push({ tier: 'legendary', n: 'c' }, 0);
  q.push({ tier: 'rare', n: 'd' }, 0);
  const order = [q.active[0].n];
  for (let t = 1000; t <= 3000; t += 1000) { q.update(t); order.push(q.active[0].n); }
  assert.deepEqual(order, ['a', 'c', 'd', 'b']);
});

test('popup queue over 10 pending drops lowest tier first', () => {
  const q = createPopupQueue({ maxVisible: 2, durationMs: 3000, maxPending: 10 });
  q.push({ tier: 'epic', n: 'show1' }, 0);
  q.push({ tier: 'epic', n: 'show2' }, 0);
  q.push({ tier: 'trash', n: 't1' }, 0);
  for (let i = 0; i < 10; i++) q.push({ tier: 'common', n: `c${i}` }, 0);
  assert.equal(q.pending.length, 10);
  assert.ok(!q.pending.some((p) => p.n === 't1'), 'trash dropped first');
  q.push({ tier: 'legendary', n: 'L' }, 0);
  assert.equal(q.pending.length, 10);
  assert.ok(q.pending.some((p) => p.n === 'L'));
  assert.ok(!q.pending.some((p) => p.n === 'c0'), 'oldest of lowest tier dropped');
});

test('feed keeps the last N lines and skips non-feed events', () => {
  const f = createFeed(3);
  assert.equal(f.add({ kind: 'cast', name: 'a' }, 0), false);
  for (const n of ['a', 'b', 'c', 'd']) f.add({ kind: 'seat', name: n }, 0);
  assert.deepEqual(f.lines.map((l) => l.text), ['@b vừa vào bến', '@c vừa vào bến', '@d vừa vào bến']);
  f.add({ kind: 'level_up', name: 'e', level: 5, title: 'Cần thủ làng' }, 0);
  assert.equal(f.lines.at(-1).tone, 'gold');
});

test('leaderboard rotates every rotateSec; hints every 5s', () => {
  assert.equal(leaderboardView(0, 10), 'session');
  assert.equal(leaderboardView(9999, 10), 'session');
  assert.equal(leaderboardView(10000, 10), 'today');
  assert.equal(leaderboardView(20000, 10), 'session');
  assert.notEqual(hintAt(0).text, hintAt(5000).text);
  assert.equal(hintAt(0).text, hintAt(5000 * HINTS.length).text); // vòng lặp đủ số gợi ý
  assert.equal(queueText(0), null);
  assert.equal(queueText(8), 'Đang chờ: 8 người');
});
