// Bộ nhớ đệm avatar: tải một lần mỗi URL, thu nhỏ sẵn thành hình tròn `size`×`size`, ảnh lỗi thì bỏ qua.
// URL avatar TikTok có chữ ký và đổi theo thời gian, nên mục nào không còn trên bến quá TTL_MS
// thì bị xóa, và tổng số mục giới hạn MAX_ENTRIES (bỏ mục lâu không thấy nhất).

const TTL_MS = 60_000;
const MAX_ENTRIES = 50;

export function createAvatarCache({ size }) {
  const entries = new Map(); // url -> {state, canvas, lastSeen}

  function shrink(img) {
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, 0, 0, size, size);
    return c;
  }

  function load(url, now) {
    const e = { state: 'loading', canvas: null, lastSeen: now };
    const img = new Image();
    img.onload = () => {
      if (!(img.naturalWidth > 0)) { e.state = 'failed'; return; }
      try { e.canvas = shrink(img); e.state = 'ok'; } catch { e.state = 'failed'; }
    };
    img.onerror = () => { e.state = 'failed'; };
    img.src = url;
    entries.set(url, e);
  }

  return {
    // Trả về canvas avatar đã sẵn sàng, hoặc null (đang tải / lỗi / không có).
    get(url) {
      const e = url ? entries.get(url) : null;
      return e?.state === 'ok' ? e.canvas : null;
    },
    // Gọi mỗi khung hình với các URL đang trên bến: tải URL mới, dọn URL cũ.
    sweep(urls, now) {
      for (const url of urls) {
        if (!url) continue;
        const e = entries.get(url);
        if (e) e.lastSeen = now;
        else load(url, now);
      }
      for (const [url, e] of entries) if (now - e.lastSeen > TTL_MS) entries.delete(url);
      if (entries.size > MAX_ENTRIES) {
        const oldest = [...entries].sort((a, b) => a[1].lastSeen - b[1].lastSeen);
        for (const [url] of oldest.slice(0, entries.size - MAX_ENTRIES)) entries.delete(url);
      }
    },
    size: () => entries.size,
  };
}
