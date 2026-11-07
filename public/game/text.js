// Chữ trên canvas #hud: font pixel VT323 cho tiêu đề/số, Be Vietnam Pro cho chữ nhỏ, luôn có viền tối.
// Tên người xem là dữ liệu lạ: chỉ vẽ bằng fillText (không qua DOM) và luôn giới hạn maxWidth.

export const FONT_PIXEL = '"VT323", "Be Vietnam Pro", monospace';
export const FONT_SANS = '"Be Vietnam Pro", system-ui, sans-serif';
export const INK = '#1b0f08';

export function setFont(ctx, { font = FONT_SANS, size = 24, weight = 700 } = {}) {
  ctx.font = `${weight} ${size}px ${font}`;
}

// Bộ nhận chữ (SVG): khi được đặt, mọi lệnh drawOutlinedText đi qua đây thay vì canvas.
// Nhận (ctx, text, x, y, opts) và trả về bề rộng; ctx mang transform và globalAlpha hiện hành.
let textSink = null;
export function setTextSink(fn) { textSink = fn; }

// Vẽ chữ có viền. Trả về bề rộng thực tế (đã tính maxWidth).
export function drawOutlinedText(ctx, text, x, y, opts = {}) {
  if (textSink) return textSink(ctx, text, x, y, opts);
  const {
    font = FONT_SANS, size = 24, weight = 700, color = '#ffffff', outline = '#000', width = 6,
    align = 'left', baseline = 'alphabetic', maxWidth, shadow = null,
  } = opts;
  const str = String(text ?? '');
  setFont(ctx, { font, size, weight });
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  const natural = ctx.measureText(str).width;
  const mw = Number.isFinite(maxWidth) && maxWidth > 0 ? maxWidth : undefined;
  if (shadow) {
    ctx.fillStyle = shadow;
    if (mw) ctx.fillText(str, x, y + Math.max(3, size / 8), mw); else ctx.fillText(str, x, y + Math.max(3, size / 8));
  }
  if (width > 0) {
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.lineWidth = width;
    ctx.strokeStyle = outline;
    if (mw) ctx.strokeText(str, x, y, mw); else ctx.strokeText(str, x, y);
  }
  ctx.fillStyle = color;
  if (mw) ctx.fillText(str, x, y, mw); else ctx.fillText(str, x, y);
  return mw ? Math.min(natural, mw) : natural;
}

export function measure(ctx, text, opts = {}) {
  setFont(ctx, opts);
  return ctx.measureText(String(text ?? '')).width;
}

// Chờ font web tải xong (có giới hạn thời gian) để chữ canvas không vẽ bằng font dự phòng rồi nhảy.
// Canvas không tự kích hoạt tải font, nên yêu cầu tải rõ ràng từng kiểu dùng tới (kèm ký tự có dấu).
export function waitForFonts(timeoutMs = 2000) {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve(false);
  const sample = 'Ạạ Đđ Ữữ';
  const loads = [
    `400 40px "VT323"`, `500 24px "Be Vietnam Pro"`, `700 24px "Be Vietnam Pro"`, `800 24px "Be Vietnam Pro"`,
  ].map((f) => document.fonts.load(f, sample).catch(() => []));
  const all = Promise.all(loads).then(() => document.fonts.ready).then(() => true);
  const timeout = new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs));
  return Promise.race([all, timeout]);
}
