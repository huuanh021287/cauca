// Khung và biểu tượng kiểu pixel cho lớp HUD (vẽ trên #hud, mỗi "pixel" = u px high-res, mặc định 4
// để khớp lưới ×4 của cảnh). Không dùng emoji trên canvas: mỗi máy/OBS vẽ emoji khác nhau và viền xấu.

import { INK } from '../text.js';

const snap = (v, u) => Math.round(v / u) * u;

// Khung bo góc bậc thang: viền mực, vành màu, ruột, vệt sáng trên và bóng dưới.
export function pixelPanel(ctx, x, y, w, h, { fill, rim, light, dark, u = 4, planks = 0, plankColor } = {}) {
  x = snap(x, u); y = snap(y, u); w = snap(w, u); h = snap(h, u);
  const notched = (ix, iy, iw, ih, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(ix + u, iy, iw - 2 * u, ih);
    ctx.fillRect(ix, iy + u, iw, ih - 2 * u);
  };
  notched(x, y, w, h, INK);
  notched(x + u, y + u, w - 2 * u, h - 2 * u, rim);
  ctx.fillStyle = fill;
  ctx.fillRect(x + 2 * u, y + 2 * u, w - 4 * u, h - 4 * u);
  if (planks > 0 && plankColor) {
    ctx.fillStyle = plankColor;
    for (let py = y + 2 * u + planks; py < y + h - 3 * u; py += planks) ctx.fillRect(x + 2 * u, py, w - 4 * u, u);
  }
  if (light) { ctx.fillStyle = light; ctx.fillRect(x + 2 * u, y + 2 * u, w - 4 * u, u); }
  if (dark) { ctx.fillStyle = dark; ctx.fillRect(x + 2 * u, y + h - 3 * u, w - 4 * u, u); }
  return { x, y, w, h };
}

// Biểu tượng 8–9 ô; '.' trong suốt.
const ICONS = {
  trophy: {
    rows: [
      'k.kkkkk.k',
      'kykyyyykk',
      'kyky#yyky',
      '.kyyyyyk.',
      '..kyyyk..',
      '...kyk...',
      '...kyk...',
      '..kkkkk..',
      '..kbbbk..',
    ],
    pal: { k: INK, y: '#ffd23a', '#': '#fff6c8', b: '#8a5a32' },
  },
  fish: {
    rows: [
      '...kkkk...',
      '.kkbbbbk.k',
      'kbbwbbbbkk',
      'kbkbbbbbbk',
      'kbbbbbbbkk',
      '.kkllllk.k',
      '...kkkk...',
    ],
    pal: { k: INK, b: '#5fb8e8', w: '#ffffff', l: '#d8f0ff' },
  },
  heart: {
    rows: [
      '.kk...kk.',
      'krrk.krrk',
      'krwrkrrrk',
      'krrrrrrrk',
      '.krrrrrk.',
      '..krrrk..',
      '...krk...',
      '....k....',
    ],
    pal: { k: INK, r: '#ff4f6d', w: '#ffd0dc' },
  },
  chat: {
    rows: [
      '.kkkkkkk.',
      'kwwwwwwwk',
      'kwkwkwkwk',
      'kwwwwwwwk',
      '.kkwkkkk.',
      '..kwk....',
      '..kk.....',
    ],
    pal: { k: INK, w: '#fff3d6' },
  },
  star: {
    rows: [
      '....k....',
      '...kyk...',
      'kkkkyykkk',
      'kyyyyyyyk',
      '.kyyyyyk.',
      '..kyyyk..',
      '.kyykyyk.',
      'kkk...kkk',
    ],
    pal: { k: INK, y: '#ffd23a' },
  },
  hourglass: {
    rows: [
      'kkkkkkk',
      'kbbbbbk',
      '.kyyyk.',
      '..kyk..',
      '..k.k..',
      '.k.y.k.',
      'kbyyybk',
      'kkkkkkk',
    ],
    pal: { k: INK, b: '#b07a3e', y: '#ffd23a' },
  },
  sparkle: {
    rows: ['..y..', '.ywy.', 'ywwwy', '.ywy.', '..y..'],
    pal: { w: '#ffffff', y: '#ffe7a8' },
  },
};

export function iconSize(name, u = 4) {
  const ic = ICONS[name];
  return ic ? { w: ic.rows[0].length * u, h: ic.rows.length * u } : { w: 0, h: 0 };
}

// (x, y) là góc trên trái.
export function drawIcon(ctx, name, x, y, u = 4) {
  const ic = ICONS[name];
  if (!ic) return;
  x = Math.round(x); y = Math.round(y);
  for (let r = 0; r < ic.rows.length; r++) {
    const row = ic.rows[r];
    for (let c = 0; c < row.length; c++) {
      const col = ic.pal[row[c]];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x + c * u, y + r * u, u, u);
    }
  }
}
