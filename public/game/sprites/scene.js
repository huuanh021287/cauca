// Sprite cảnh làng quê: núi xa, đồi ruộng bậc thang, dừa, tre, chòi lá, sen, mây, trăng, bến gỗ.
// Bảng màu theo buổi (day / dusk / night) nằm ở PALETTES.

import { registerSprite } from './registry.js';
import { rect, dot, line, grid, shade } from './pixel.js';

export const PALETTES = {
  day: {
    sky: ['#6ec3ee', '#86cff2', '#a3dbf5', '#c3e8f6', '#e2f4f4'],
    mountain: ['#9cc0d2', '#7da6be'], hill: ['#8fcf5c', '#6db446', '#4f9638'], terrace: '#b6e27a',
    water: ['#58b4d4', '#479fc4', '#3a8bb3', '#2f78a1'], ripple: '#bfe8f4', glint: '#ffffff',
    trunk: '#8a5a32', leaf: '#3f8a35', leafHi: '#69b04a', bamboo: '#7fb84a', bambooDark: '#4f8a32',
    wood: ['#c98d55', '#a46a3c', '#74482a', '#45291a'], cloud: '#ffffff', cloudShade: '#d8ecf6',
    hut: ['#d9b56a', '#a8803e', '#6b4a28'], lotus: '#f28fb4', pad: '#3f9a4a', padHi: '#6cc25a',
  },
  dusk: {
    sky: ['#3b3a7c', '#7a4a8c', '#c95f72', '#f08a5a', '#ffc46a'],
    mountain: ['#9a6a8e', '#6f4d80'], hill: ['#7a8a44', '#5e7036', '#45552c'], terrace: '#a8a656',
    water: ['#c97a6a', '#8e5a7a', '#634a7c', '#46386a'], ripple: '#ffc98a', glint: '#ffe3a0',
    trunk: '#5a3a2a', leaf: '#3a4a2a', leafHi: '#5a6a34', bamboo: '#6a7a3a', bambooDark: '#3f4a26',
    wood: ['#c07a4a', '#94593a', '#663c28', '#3e2418'], cloud: '#ffb48a', cloudShade: '#d8708a',
    hut: ['#c0905a', '#8a5f3a', '#563a28'], lotus: '#ff9ab8', pad: '#4a6a3a', padHi: '#6a8a44',
  },
  night: {
    sky: ['#0b0d2a', '#12163c', '#1a1f4e', '#232a60', '#2e3670'],
    mountain: ['#2a3060', '#1e2348'], hill: ['#24423a', '#1b342e', '#132622'], terrace: '#2f5446',
    water: ['#1f2a5c', '#19224e', '#141b42', '#101536'], ripple: '#6f7fc4', glint: '#fff3c4',
    trunk: '#2a1e1e', leaf: '#16302a', leafHi: '#24463a', bamboo: '#1f3a2c', bambooDark: '#142820',
    wood: ['#8a6448', '#6a4a36', '#4a3226', '#2a1c16'], cloud: '#4a5288', cloudShade: '#363c6e',
    hut: ['#6a5a48', '#4a3e32', '#2e2620'], lotus: '#c78ab0', pad: '#1f3a32', padHi: '#2f5244',
  },
};
const pal = (opts) => PALETTES[opts?.phase] ?? PALETTES.day;

// Dãy núi xa: chuỗi đỉnh tròn, bóng phía sau tối hơn. (x,y) = góc trái trên dải, opts.w rộng, opts.h cao.
function drawMountain(ctx, x, y, opts = {}) {
  const p = pal(opts), w = opts.w ?? 270, h = opts.h ?? 50;
  const layers = [
    { c: p.mountain[0], peaks: [[0.1, 0.55], [0.32, 0.95], [0.55, 0.6], [0.78, 0.85], [0.98, 0.5]] },
    { c: p.mountain[1], peaks: [[0.0, 0.35], [0.2, 0.6], [0.45, 0.4], [0.68, 0.55], [0.9, 0.38]] },
  ];
  for (const { c, peaks } of layers) {
    ctx.fillStyle = c;
    for (let i = 0; i < w; i++) {
      let top = 0;
      for (const [px, ph] of peaks) {
        const d = Math.abs(i / w - px) / 0.16;
        top = Math.max(top, ph * Math.max(0, 1 - d * d));
      }
      const hh = Math.round(top * h);
      ctx.fillRect(x + i, y + h - hh, 1, hh);
    }
  }
}

// Đồi ruộng bậc thang ở bờ xa.
export function drawHills(ctx, y, w, opts) {
  const p = pal(opts);
  const hills = [
    { cx: 50, r: 120, h: 34, c: p.hill[0] },
    { cx: 215, r: 110, h: 40, c: p.hill[1] },
    { cx: 135, r: 150, h: 22, c: p.hill[2] },
  ];
  for (const hl of hills) {
    for (let i = 0; i < w; i++) {
      const d = (i - hl.cx) / hl.r;
      if (Math.abs(d) >= 1) continue;
      const hh = Math.round(hl.h * Math.sqrt(1 - d * d));
      rect(ctx, i, y - hh, 1, hh + 1, hl.c);
      // Bờ ruộng: các đường ngang lượn theo dáng đồi
      for (let k = 4; k < hh; k += 5) dot(ctx, i, y - hh + k, (i + k) % 7 === 0 ? hl.c : p.terrace);
    }
  }
}

// Cây: opts.kind = 'coconut' | 'bamboo'. Neo ở gốc cây.
function drawTree(ctx, x, y, opts = {}) {
  const p = pal(opts);
  x = Math.round(x); y = Math.round(y);
  if (opts.kind === 'bamboo') {
    const stalks = opts.stalks ?? [[-4, 46, -2], [0, 54, 1], [4, 42, 3], [7, 36, 4]];
    for (const [dx, h, lean] of stalks) {
      for (let j = 0; j < h; j++) {
        const sx = x + dx + Math.round((lean * j) / h);
        dot(ctx, sx, y - j, j % 9 === 0 ? p.bambooDark : p.bamboo);
        if (j % 9 === 4 && j > 10) {
          const s = j % 18 === 4 ? 1 : -1;
          line(ctx, sx, y - j, sx + 4 * s, y - j - 2, p.leaf);
          dot(ctx, sx + 2 * s, y - j - 2, p.leafHi);
        }
      }
    }
    return;
  }
  // Dừa: thân cong, tán lá xòe
  const h = opts.h ?? 58, lean = opts.lean ?? 8;
  let tx = x, ty = y;
  for (let j = 0; j < h; j++) {
    tx = x + Math.round(lean * Math.pow(j / h, 2));
    ty = y - j;
    rect(ctx, tx, ty, 2, 1, j % 4 === 0 ? shade(p.trunk, -0.25) : p.trunk);
  }
  const fronds = [[-12, 3], [-9, -4], [-3, -7], [4, -6], [10, -3], [13, 4], [7, 6], [-7, 6]];
  for (const [fx, fy] of fronds) {
    const ex = tx + fx, ey = ty + fy + 4;
    const mx = tx + fx / 2, my = ty + Math.min(fy, 0) - 1;
    line(ctx, tx, ty, mx, my, p.leaf);
    line(ctx, mx, my, ex, ey, p.leaf);
    dot(ctx, mx, my - 1, p.leafHi);
  }
  dot(ctx, tx, ty + 2, '#6a4a1e'); dot(ctx, tx + 2, ty + 2, '#6a4a1e'); dot(ctx, tx + 1, ty + 3, '#6a4a1e');
}

// Chòi lá trên cọc (neo ở chân cọc).
function drawHut(ctx, x, y, opts = {}) {
  const [roof, roofDark, wall] = pal(opts).hut;
  grid(ctx, [
    '.....rrrr.....',
    '...rrRrrRrr...',
    '.rrRrrrrrrRrr.',
    'rRrrrrrrrrrrRr',
    '..wwwwwwwwww..',
    '..wwddwwwwww..',
    '..wwddwwwwww..',
    '..pppppppppp..',
    '...p......p...',
    '...p......p...',
  ], { r: roof, R: roofDark, w: wall, d: '#2a1a10', p: shade(wall, -0.3) }, Math.round(x) - 7, Math.round(y) - 10);
  if (opts.phase !== 'day') rect(ctx, Math.round(x) - 3, Math.round(y) - 5, 2, 2, '#ffd36a');
}

// Lá sen + hoa (neo giữa lá).
function drawLotus(ctx, x, y, opts = {}) {
  const p = pal(opts);
  grid(ctx, [
    '.pppp.',
    'pPPpPp',
    'pPPPPp',
    '.pppp.',
  ], { p: p.pad, P: p.padHi }, Math.round(x) - 3, Math.round(y) - 2);
  if (opts.flower) grid(ctx, ['.f.', 'fFf', '.g.'], { f: p.lotus, F: shade(p.lotus, 0.4), g: p.pad }, Math.round(x), Math.round(y) - 4);
}

function drawCloud(ctx, x, y, opts = {}) {
  const p = pal(opts);
  grid(ctx, [
    '.....cccc........',
    '...cccccccc.ccc..',
    '.cccccccccccccccc',
    'csssssssssssssssc',
  ], { c: p.cloud, s: p.cloudShade }, Math.round(x), Math.round(y));
}

function drawMoon(ctx, x, y) {
  grid(ctx, [
    '...mmmm...',
    '.mmmmmmmm.',
    '.mmMmmmmmm',
    'mmMMmmmmmm',
    'mmmmmmmMmm',
    'mmmmmmMMmm',
    'mmmMmmmmmm',
    '.mmmmmmmm.',
    '.mmmmmmmm.',
    '...mmmm...',
  ], { m: '#fff3c4', M: '#e6d48e' }, Math.round(x) - 5, Math.round(y) - 5);
}

function drawSun(ctx, x, y, opts = {}) {
  const r = opts.r ?? 9;
  for (let dy = -r; dy <= r; dy++) {
    const half = Math.round(Math.sqrt(r * r - dy * dy));
    rect(ctx, x - half, y + dy, half * 2 + 1, 1, opts.color ?? '#fff1a8');
  }
}

// Bến gỗ trải ngang: mặt ván (y-2..y+1), mép ván, cọc xuống nước. (x,y) = mép trái mặt bến.
function drawDock(ctx, x, y, opts = {}) {
  const [top, mid, face, dark] = pal(opts).wood;
  const w = opts.w ?? 270;
  rect(ctx, x, y - 2, w, 4, top);
  for (let i = x; i < x + w; i += 9) rect(ctx, i, y - 2, 1, 4, mid);
  for (let i = x + 4; i < x + w; i += 13) dot(ctx, i, y - 1, mid);
  rect(ctx, x, y + 2, w, 1, dark);
  rect(ctx, x, y + 3, w, 4, face);
  rect(ctx, x, y + 7, w, 1, dark);
  for (let i = x + 6; i < x + w; i += 21) {
    rect(ctx, i, y + 8, 3, 8, mid);
    rect(ctx, i + 2, y + 8, 1, 8, dark);
    rect(ctx, i - 1, y + 16, 5, 1, 'rgba(255,255,255,0.35)');
  }
}

// Đèn lồng treo trên cọc bến (buổi chiều, đêm).
function drawLantern(ctx, x, y, opts = {}) {
  const t = opts.t ?? 0;
  ctx.fillStyle = `rgba(255,190,90,${0.18 + 0.06 * Math.sin(t / 300)})`;
  ctx.fillRect(x - 5, y - 4, 11, 11);
  ctx.fillRect(x - 3, y - 6, 7, 15);
  grid(ctx, ['.k.', 'rrr', 'ryr', 'rrr', '.k.'], { k: '#3a2418', r: '#d8402e', y: '#ffd36a' }, x - 1, y - 2);
}

export function registerSceneSprites() {
  registerSprite('scene.mountain', drawMountain, { anchor: 'topleft' });
  registerSprite('scene.tree', drawTree, { anchor: 'bottom' });
  registerSprite('scene.hut', drawHut, { anchor: 'bottom' });
  registerSprite('scene.lotus', drawLotus);
  registerSprite('scene.cloud', drawCloud, { anchor: 'topleft' });
  registerSprite('scene.moon', drawMoon);
  registerSprite('scene.sun', drawSun);
  registerSprite('scene.dock', drawDock, { anchor: 'topleft' });
  registerSprite('scene.lantern', drawLantern);
}
