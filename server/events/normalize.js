// Dịch sự kiện thô của tiktok-live-connector thành StdEvent.
// Đọc được dạng thật của v2.5 (proto v3: user.id, user.displayId, avatarThumb.urlList,
// chat.content, like.count, gift.type/diamondCount/name) lẫn dạng phẳng/v2 cũ
// (userId, uniqueId, comment, likeCount, giftType, giftDetails, extendedGiftInfo).
import { sanitizeName, sanitizeAvatar } from './sanitize.js';

// Tên sự kiện của thư viện mà Task 7 cần subscribe.
export const TIKTOK_EVENTS = ['member', 'like', 'chat', 'follow', 'share', 'social', 'gift'];

const DEFAULT_NAME_MAX = 12;

function pick(...vals) {
  return vals.find((v) => v !== undefined && v !== null && v !== '');
}

function readUser(data, nameMax) {
  const u = data.user ?? data;
  const id = pick(u.userId, u.id, u.uniqueId, u.displayId, data.userId);
  if (id === undefined || String(id) === '0') return null;
  const name = pick(u.nickname, u.uniqueId, u.displayId);
  const avatar = pick(
    u.profilePictureUrl,
    u.profilePicture?.url?.[0],
    u.avatarThumb?.urlList?.[0],
    u.avatarMedium?.urlList?.[0],
  );
  return { id: String(id), name: sanitizeName(name, nameMax), avatar: sanitizeAvatar(avatar) };
}

function socialKind(data) {
  const hay = [data.displayType, data.action, data.common?.displayText?.key]
    .filter((v) => typeof v === 'string')
    .join(' ')
    .toLowerCase();
  if (hay.includes('follow')) return 'follow';
  if (hay.includes('share')) return 'share';
  return null;
}

function giftEvent(data, user) {
  const giftType = pick(data.giftType, data.giftDetails?.giftType, data.gift?.type);
  const repeatEnd = data.repeatEnd === true || Number(data.repeatEnd) > 0;
  // Quà streak: chỉ tính khi kết thúc chuỗi (repeatEnd), giữa chừng bỏ qua.
  if (Number(giftType) === 1 && !repeatEnd) return null;
  const diamond = Number(pick(
    data.diamondCount,
    data.giftDetails?.diamondCount,
    data.gift?.diamondCount,
    data.extendedGiftInfo?.diamond_count,
    data.extendedGiftInfo?.diamondCount,
  ));
  const repeat = Number(pick(data.repeatCount, 1));
  const coins = Number.isFinite(diamond) && Number.isFinite(repeat) ? Math.max(0, diamond * repeat) : 0;
  const giftName = pick(
    data.giftName,
    data.giftDetails?.giftName,
    data.gift?.name,
    data.extendedGiftInfo?.name,
  );
  const event = { type: 'gift', user, coins };
  if (giftName !== undefined) event.giftName = String(giftName);
  return event;
}

export function normalizeTikTok(eventName, data, config) {
  if (!data || typeof data !== 'object') return null;
  if (!TIKTOK_EVENTS.includes(eventName)) return null;
  const user = readUser(data, config?.ui?.nameMaxChars ?? DEFAULT_NAME_MAX);
  if (!user) return null;

  switch (eventName) {
    case 'member':
      return { type: 'join', user };
    case 'like': {
      const count = Number(pick(data.likeCount, data.count));
      if (!Number.isFinite(count) || count <= 0) return null;
      return { type: 'like', user, count };
    }
    case 'chat': {
      const text = String(pick(data.comment, data.content) ?? '').trim();
      if (!text) return null;
      return { type: 'chat', user, text };
    }
    case 'follow':
      return { type: 'follow', user };
    case 'share':
      return { type: 'share', user };
    case 'social': {
      const kind = socialKind(data);
      return kind ? { type: kind, user } : null;
    }
    case 'gift':
      return giftEvent(data, user);
    default:
      return null;
  }
}
