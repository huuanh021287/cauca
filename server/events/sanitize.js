// Lọc tên/ảnh đại diện từ TikTok trước khi đưa vào game.
const DEFAULT_NAME = 'Cần thủ';
// Ký tự điều khiển (Cc) và ký tự định dạng vô hình (Cf: zero-width, bidi, ...), cùng dấu cách lạ.
// Giữ lại U+200D (ZWJ) vì emoji ghép (gia đình, nghề nghiệp) cần nó; bị cắt theo grapheme nên an toàn.
const INVISIBLE = /(?!\u200D)[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\u2800\u3164\uFFA0]/gu;
const segmenter = new Intl.Segmenter('vi', { granularity: 'grapheme' });

export function sanitizeName(raw, maxChars = 12) {
  const cleaned = String(raw ?? '').normalize('NFC').replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();
  if (!cleaned.replace(/\u200D/g, '').trim()) return DEFAULT_NAME;
  const graphemes = Array.from(segmenter.segment(cleaned), (s) => s.segment);
  if (graphemes.length <= maxChars) return cleaned;
  return graphemes.slice(0, maxChars).join('') + '…';
}

export function sanitizeAvatar(url) {
  if (typeof url !== 'string') return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}
