// Nhận lệnh chat: bỏ dấu tiếng Việt, chữ thường, chỉ xét từ đầu tiên.
function foldVietnamese(text) {
  return String(text)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/đ/g, 'd');
}

const trimPunct = (w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

export function parseCommand(config, text) {
  if (typeof text !== 'string') return null;
  const first = trimPunct(foldVietnamese(text).trim().split(/\s+/)[0] ?? '');
  if (!first) return null;
  for (const kind of ['cast', 'reel']) {
    const words = config.commands[kind] ?? [];
    if (words.some((w) => foldVietnamese(w) === first)) return kind;
  }
  return null;
}
