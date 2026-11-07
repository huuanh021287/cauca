// Bố cục trang game — hàm thuần, không đụng DOM (test chạy được trong Node).
// Tọa độ pixel art ở độ phân giải thấp: ui.width/4 × ui.height/4 (270×480).

export const SCALE = 4;
export const SEATS_PER_ROW = 6;
const CELL = 42;            // khoảng cách giữa hai ghế (low-res)
const ROW_Y = [250, 360];   // mặt bến của hàng 1 và hàng 2 (low-res)

// Nhân vật vẽ phóng ×2 (số nguyên để pixel vẫn sắc).
export const CHAR_SCALE = 2;
// Phạm vi vẽ quanh điểm ngồi (low-res): từ đỉnh huy hiệu cấp (top) tới dưới phao (bottom),
// và nửa bề ngang nón lá. render/characters.js đặt avatar/tên/huy hiệu theo các mốc này.
export const CHAR_BOX = { top: 62, bottom: 32, halfWidth: 16 };
export const LABEL = { avatarY: 42, avatarR: 6, nameNoAvatarY: 38 };

export function lowRes(ui) {
  return { w: ui.width / SCALE, h: ui.height / SCALE };
}

// Vị trí ghế (điểm nhân vật ngồi trên mặt bến). Hàng 2 thấp hơn và lệch nửa ô.
export function seatPosition(index, ui) {
  const { w } = lowRes(ui);
  const row = Math.floor(index / SEATS_PER_ROW);
  const col = index % SEATS_PER_ROW;
  const span = CELL * (SEATS_PER_ROW - 1) + CELL / 2;
  const left = Math.round((w - span) / 2);
  return { x: left + col * CELL + (row % 2) * (CELL / 2), y: ROW_Y[row % ROW_Y.length] };
}

export function rowY(row) {
  return ROW_Y[row % ROW_Y.length];
}

// Dải an toàn (high-res) mà UI của TikTok không che.
export function safeRect(ui) {
  return { top: ui.safeTop, bottom: ui.height - ui.safeBottom };
}

// Trời theo giờ địa phương: 6–17 ngày, 17–19 chiều, còn lại đêm.
export function skyPhase(date) {
  const h = date.getHours();
  if (h >= 6 && h < 17) return 'day';
  if (h >= 17 && h < 19) return 'dusk';
  return 'night';
}

// Băm FNV-1a 32 bit — ổn định giữa các lần tải trang.
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// Màu áo theo tên: tông tươi, đủ sáng để nổi trên nền gỗ và nước.
export function colorFromName(name) {
  const h = hashString(String(name ?? ''));
  const hue = h % 360;
  const sat = 55 + ((h >>> 9) % 25);
  const light = 50 + ((h >>> 17) % 12);
  return hslToHex(hue, sat, light);
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const hex = (v) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`;
}
