// Công cụ vẽ pixel dùng chung cho các sprite (canvas low-res, không làm mịn).

export function rect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

export function dot(ctx, x, y, color) {
  rect(ctx, x, y, 1, 1, color);
}

// Đường thẳng Bresenham: nét 1 pixel sắc cạnh.
export function line(ctx, x0, y0, x1, y1, color) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  ctx.fillStyle = color;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    ctx.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

// Đường cong bậc hai, nối từng đoạn thẳng ngắn.
export function curve(ctx, x0, y0, cx, cy, x1, y1, color, steps = 10) {
  let px = x0, py = y0;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    const x = u * u * x0 + 2 * u * t * cx + t * t * x1;
    const y = u * u * y0 + 2 * u * t * cy + t * t * y1;
    line(ctx, px, py, x, y, color);
    px = x; py = y;
  }
}

// Vẽ lưới ký tự: mỗi ký tự là một màu trong `pal`, '.' là trong suốt.
export function grid(ctx, rows, pal, x, y, { flip = false } = {}) {
  const w = rows[0].length;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let c = 0; c < row.length; c++) {
      const color = pal[row[c]];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(x) + (flip ? w - 1 - c : c), Math.round(y) + r, 1, 1);
    }
  }
}

// Vẽ trước một hình vào canvas phụ để dùng lại mỗi khung hình.
export function bake(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  draw(ctx);
  return c;
}

export function bakeGrid(rows, pal) {
  return bake(rows[0].length, rows.length, (ctx) => grid(ctx, rows, pal, 0, 0));
}

// Làm sáng (amt > 0) hoặc tối (amt < 0) một màu #rrggbb.
export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))));
  const r = ch(n >> 16), g = ch((n >> 8) & 255), b = ch(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

export function withAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}
