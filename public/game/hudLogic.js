// Logic thuần của lớp HUD (không đụng DOM, test chạy trong Node):
// định dạng kg/giờ, câu chữ dòng tin, nội dung popup, hàng đợi popup có ưu tiên, bảng xếp hạng luân phiên.

export const TIERS = ['trash', 'common', 'rare', 'epic', 'legendary'];
const tierRank = (tier) => Math.max(0, TIERS.indexOf(tier));

// 54.25 → "54.3" (luôn 1 chữ số thập phân; dữ liệu lạ → "0.0").
export function formatKg(kg) {
  const n = Number(kg);
  return (Number.isFinite(n) ? Math.round(n * 10) / 10 : 0).toFixed(1);
}

export function formatClock(date) {
  const p = (v) => String(v).padStart(2, '0');
  return `${p(date.getHours())}:${p(date.getMinutes())}`;
}

// Cùng luật với server (server/events/sanitize.js): đếm theo grapheme, quá `max` thì giữ `max` cái đầu + "…".
// Tên server đã lọc đi qua đây không đổi; canvas còn giới hạn maxWidth khi vẽ.
const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('vi', { granularity: 'grapheme' }) : null;
const graphemes = (s) => (segmenter ? Array.from(segmenter.segment(s), (g) => g.segment) : Array.from(s));

export function shortName(name, max = 12) {
  const text = String(name ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return 'ẩn danh';
  const parts = graphemes(text);
  return parts.length > max ? `${parts.slice(0, max).join('')}…` : text;
}

const upper = (s) => String(s ?? '').toLocaleUpperCase('vi');

// Một dòng tin từ DisplayEvent; null nếu loại sự kiện không lên dòng tin.
export function feedText(ev, { nameMax = 12 } = {}) {
  const at = `@${shortName(ev.name, nameMax)}`;
  switch (ev.kind) {
    case 'seat': return `${at} vừa vào bến`;
    case 'leave': return `${at} đã về nhà`;
    case 'miss': return `${at} để cá thoát mất!`;
    case 'welcome_back': return `Chào mừng ${ev.title} cấp ${ev.level} ${at} quay lại!`;
    case 'level_up': return `${at} lên cấp ${ev.level} — ${ev.title}!`;
    case 'follow_thanks': return `Cảm ơn ${at} đã follow! +${ev.bait} mồi thơm`;
    case 'share_thanks': return `Cảm ơn ${at} đã chia sẻ! +${ev.bait} mồi thơm`;
    case 'gift':
      if (ev.effect === 'fast') return `${at} tặng quà — câu nhanh gấp đôi!`;
      if (ev.effect === 'bait') return `${at} tặng quà — thêm mồi thơm!`;
      if (ev.effect === 'legendary') return `${at} tặng quà lớn — cơ hội Huyền thoại!`;
      return `Cảm ơn ${at} đã tặng quà!`;
    default: return null;
  }
}

// Màu dòng tin theo loại (để người xem nhận ra nhanh).
export function feedTone(kind) {
  switch (kind) {
    case 'level_up': case 'welcome_back': return 'gold';
    case 'follow_thanks': case 'share_thanks': return 'pink';
    case 'gift': return 'gift';
    case 'leave': case 'miss': return 'dim';
    default: return 'plain';
  }
}

const TRASH_JOKES = [
  'Thôi xong… về nhà ăn cơm thôi',
  'Ao làng sạch thêm một chút!',
  'Cá hôm nay nghỉ chợ rồi',
  'Mang về làm kỷ niệm nha',
  'Cần câu cũng biết buồn đó',
];

function hashStr(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

// Nội dung popup cho sự kiện `catch`.
export function popupContent(ev, { nameMax = 12 } = {}) {
  const at = `@${shortName(ev.name, nameMax)}`;
  const tier = TIERS.includes(ev.tier) ? ev.tier : 'common';
  if (tier === 'trash') {
    return {
      tier, fishId: ev.fishId,
      line1: `${at} câu được…`,
      line2: upper(ev.fishName),
      joke: TRASH_JOKES[hashStr(`${ev.userId}|${ev.fishId}|${ev.name}`) % TRASH_JOKES.length],
    };
  }
  return { tier, fishId: ev.fishId, line1: `${at} câu được`, line2: `${upper(ev.fishName)} ${formatKg(ev.kg)}kg!`, joke: null };
}

// Hàng đợi popup: tối đa `maxVisible` cái hiện cùng lúc, mỗi cái `durationMs`.
// Chờ quá `maxPending` thì bỏ bớt cái bậc thấp nhất (cũ nhất trong bậc đó).
// Lấy ra hiển thị theo bậc cao trước, cùng bậc thì đến trước hiện trước.
export function createPopupQueue({ maxVisible = 2, durationMs = 3000, maxPending = 10 } = {}) {
  const pending = [];
  const active = [];
  let fresh = [];   // vừa bắt đầu hiện, chưa báo ra ngoài
  let seq = 0;

  function push(content, now) {
    pending.push({ ...content, id: ++seq });
    while (pending.length > maxPending) {
      let worst = 0;
      for (let i = 1; i < pending.length; i++) {
        if (tierRank(pending[i].tier) < tierRank(pending[worst].tier)) worst = i;
      }
      pending.splice(worst, 1);
    }
    advance(now);
  }

  function advance(now) {
    for (let i = active.length - 1; i >= 0; i--) if (now >= active[i].endsAt) active.splice(i, 1);
    while (active.length < maxVisible && pending.length) {
      let best = 0;
      for (let i = 1; i < pending.length; i++) {
        if (tierRank(pending[i].tier) > tierRank(pending[best].tier)) best = i;
      }
      const [p] = pending.splice(best, 1);
      p.startedAt = now;
      p.endsAt = now + durationMs;
      active.push(p);
      fresh.push(p);
    }
  }

  // Trả về các popup bắt đầu hiện kể từ lần gọi trước (kể cả lúc push), để kích hoạt pháo hoa…
  function update(now) {
    advance(now);
    const started = fresh;
    fresh = [];
    return started;
  }

  return { push, update, active, pending };
}

// Dòng tin: giữ `max` dòng gần nhất.
export function createFeed(max = 3) {
  const lines = [];
  return {
    lines,
    add(ev, now, opts) {
      const text = feedText(ev, opts);
      if (!text) return false;
      lines.push({ text, tone: feedTone(ev.kind), at: now });
      while (lines.length > max) lines.shift();
      return true;
    },
  };
}

// Bảng nào đang hiện: luân phiên mỗi `rotateSec` giây theo đồng hồ server.
export function leaderboardView(nowMs, rotateSec = 10) {
  const period = Math.max(1, rotateSec) * 1000;
  return Math.floor(nowMs / period) % 2 === 0 ? 'session' : 'today';
}

// Câu hướng dẫn luân phiên mỗi `everySec` giây.
export const HINTS = [
  { icon: 'chat', text: 'Gõ "câu" để quăng cần' },
  { icon: 'heart', text: 'Thả tim câu nhanh hơn' },
  { icon: 'star', text: 'Follow nhận mồi thơm' },
];
export function hintAt(nowMs, everySec = 5) {
  return HINTS[Math.floor(nowMs / (everySec * 1000)) % HINTS.length];
}

export function queueText(n) {
  return n > 0 ? `Đang chờ: ${n} người` : null;
}
