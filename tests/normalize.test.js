import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTikTok, TIKTOK_EVENTS } from '../server/events/normalize.js';
import { sanitizeName, sanitizeAvatar } from '../server/events/sanitize.js';

const config = { ui: { nameMaxChars: 12 } };

// Dạng thật của tiktok-live-connector v2.5 (proto v3): user.id / user.displayId / avatarThumb.urlList
const v3User = {
  id: '7001234567890',
  nickname: 'Lan Anh',
  displayId: 'lananh_99',
  avatarThumb: { urlList: ['https://p16.tiktokcdn.com/a.jpeg', 'https://p19.tiktokcdn.com/b.jpeg'] },
};
// Dạng phẳng v1
const v1Flat = { userId: '555', uniqueId: 'bob', nickname: 'Bob', profilePictureUrl: 'https://x.com/b.png' };

test('TIKTOK_EVENTS liệt kê đủ sự kiện xử lý', () => {
  assert.deepEqual([...TIKTOK_EVENTS].sort(), ['chat', 'follow', 'gift', 'like', 'member', 'share', 'social']);
});

test('member -> join (v3)', () => {
  const e = normalizeTikTok('member', { user: v3User, memberCount: 10 }, config);
  assert.deepEqual(e, { type: 'join', user: { id: '7001234567890', name: 'Lan Anh', avatar: 'https://p16.tiktokcdn.com/a.jpeg' } });
});

test('member -> join (v1 phẳng, ưu tiên userId hơn uniqueId)', () => {
  const e = normalizeTikTok('member', v1Flat, config);
  assert.deepEqual(e.user, { id: '555', name: 'Bob', avatar: 'https://x.com/b.png' });
});

test('v1 lồng profilePicture.url[0]', () => {
  const e = normalizeTikTok('member', { userId: 1, uniqueId: 'u', profilePicture: { url: ['https://x.com/p.png'] } }, config);
  assert.equal(e.user.id, '1');
  assert.equal(e.user.name, 'u');
  assert.equal(e.user.avatar, 'https://x.com/p.png');
});

test('v2 lồng data.user với userId/uniqueId', () => {
  const e = normalizeTikTok('member', { user: { userId: 42, uniqueId: 'abc', nickname: 'Abc' } }, config);
  assert.equal(e.user.id, '42');
});

test('like dùng count (v3) và likeCount (v1)', () => {
  assert.equal(normalizeTikTok('like', { user: v3User, count: 5, total: '100' }, config).count, 5);
  const e = normalizeTikTok('like', { ...v1Flat, likeCount: 3 }, config);
  assert.equal(e.type, 'like');
  assert.equal(e.count, 3);
});

test('like không dương hoặc thiếu -> null', () => {
  assert.equal(normalizeTikTok('like', { user: v3User, count: 0 }, config), null);
  assert.equal(normalizeTikTok('like', { user: v3User, count: -2 }, config), null);
  assert.equal(normalizeTikTok('like', { user: v3User }, config), null);
});

test('chat dùng content (v3) và comment (v1), có trim', () => {
  assert.equal(normalizeTikTok('chat', { user: v3User, content: '  cau  ' }, config).text, 'cau');
  assert.equal(normalizeTikTok('chat', { ...v1Flat, comment: 'keo' }, config).text, 'keo');
});

test('chat rỗng -> null', () => {
  assert.equal(normalizeTikTok('chat', { user: v3User, content: '   ' }, config), null);
  assert.equal(normalizeTikTok('chat', { user: v3User }, config), null);
});

test('follow và share', () => {
  assert.equal(normalizeTikTok('follow', { user: v3User }, config).type, 'follow');
  assert.equal(normalizeTikTok('share', { user: v3User }, config).type, 'share');
});

test('social có displayType / action / common.displayText.key chứa follow hoặc share', () => {
  assert.equal(normalizeTikTok('social', { ...v1Flat, displayType: 'pm_main_follow_message_viewer_2' }, config).type, 'follow');
  assert.equal(normalizeTikTok('social', { ...v1Flat, displayType: 'pm_mt_guidance_share' }, config).type, 'share');
  assert.equal(normalizeTikTok('social', { user: v3User, common: { displayText: { key: 'pm_main_follow_message_viewer_2' } } }, config).type, 'follow');
  assert.equal(normalizeTikTok('social', { user: v3User, action: 'share' }, config).type, 'share');
  assert.equal(normalizeTikTok('social', { user: v3User, action: 'other' }, config), null);
});

test('gift non-streak (giftType !== 1) -> coins = diamondCount x repeatCount', () => {
  const e = normalizeTikTok('gift', { ...v1Flat, giftType: 2, diamondCount: 5, repeatCount: 3, giftName: 'Rose' }, config);
  assert.equal(e.type, 'gift');
  assert.equal(e.coins, 15);
  assert.equal(e.giftName, 'Rose');
});

test('gift v3: gift.type/gift.diamondCount/gift.name, repeatEnd dạng số', () => {
  const data = { user: v3User, repeatCount: 1, repeatEnd: 0, gift: { type: 2, diamondCount: 30, name: 'Sư tử' } };
  const e = normalizeTikTok('gift', data, config);
  assert.equal(e.coins, 30);
  assert.equal(e.giftName, 'Sư tử');
});

test('gift v2 giftDetails và extendedGiftInfo', () => {
  const a = normalizeTikTok('gift', { user: v3User, repeatCount: 2, giftDetails: { giftType: 2, diamondCount: 10, giftName: 'Tim' } }, config);
  assert.equal(a.coins, 20);
  assert.equal(a.giftName, 'Tim');
  const b = normalizeTikTok('gift', { user: v3User, repeatCount: 2, gift: { type: 2 }, extendedGiftInfo: { diamond_count: 7, name: 'Kem' } }, config);
  assert.equal(b.coins, 14);
  assert.equal(b.giftName, 'Kem');
});

test('gift streak in progress returns null; repeatEnd returns total', () => {
  const mid = { user: v3User, repeatEnd: 0, repeatCount: 2, gift: { type: 1, diamondCount: 1, name: 'Rose' } };
  assert.equal(normalizeTikTok('gift', mid, config), null);
  assert.equal(normalizeTikTok('gift', { ...mid, repeatEnd: false }, config), null);
  const end = normalizeTikTok('gift', { ...mid, repeatEnd: 1, repeatCount: 5 }, config);
  assert.equal(end.coins, 5);
  assert.equal(normalizeTikTok('gift', { ...mid, repeatEnd: true, repeatCount: 5 }, config).coins, 5);
});

test('unknown event returns null', () => {
  assert.equal(normalizeTikTok('roomUser', { user: v3User }, config), null);
});

test('missing user id returns null', () => {
  assert.equal(normalizeTikTok('chat', { content: 'cau' }, config), null);
  assert.equal(normalizeTikTok('member', { user: { nickname: 'x' } }, config), null);
  assert.equal(normalizeTikTok('member', null, config), null);
});

test('tên được lọc theo nameMaxChars của config', () => {
  const e = normalizeTikTok('member', { user: { id: '1', nickname: 'NguyễnVănAnhTuấnKiệt' } }, { ui: { nameMaxChars: 5 } });
  assert.equal(e.user.name, 'Nguyễ…');
  const d = normalizeTikTok('member', { user: { id: '1', nickname: '' } }, config);
  assert.equal(d.user.name, 'Cần thủ');
});

test('sanitizeName: emoji hiển thị được, ký tự vô hình/điều khiển bị bỏ', () => {
  assert.equal(sanitizeName('🔥🔥🔥​'), '🔥🔥🔥');
  assert.equal(sanitizeName('\u0000​'), 'Cần thủ');
  assert.equal(sanitizeName('a‮b\u0007c'), 'abc');
});

test('sanitizeName cắt theo grapheme + …', () => {
  assert.equal(sanitizeName('NguyễnVănAnhTuấn', 12), 'NguyễnVănAnh…');
  assert.equal(sanitizeName('👨‍👩‍👧👨‍👩‍👧👨‍👩‍👧', 2), '👨‍👩‍👧👨‍👩‍👧…');
  assert.equal(sanitizeName('abc', 12), 'abc');
  assert.equal(sanitizeName(undefined), 'Cần thủ');
});

test('sanitizeAvatar chỉ nhận https', () => {
  assert.equal(sanitizeAvatar('http://x'), null);
  assert.equal(sanitizeAvatar('javascript:alert(1)'), null);
  assert.equal(sanitizeAvatar('not a url'), null);
  assert.equal(sanitizeAvatar(undefined), null);
  assert.equal(sanitizeAvatar('https://x.com/a.png'), 'https://x.com/a.png');
});
