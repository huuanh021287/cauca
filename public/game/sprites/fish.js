// Sprite cá và rác: `fish.<id>` cho từng món trong config, cùng `fish.generic` dự phòng.
// Cá thường được sinh theo tham số (dáng, màu, sọc, râu...), rác và vài con đặc biệt vẽ bằng lưới.
// Tất cả quay đầu sang phải, neo ở giữa hình.

import { registerSprite } from './registry.js';
import { bake, bakeGrid, rect, dot, shade } from './pixel.js';

// ---- Cá sinh theo tham số -------------------------------------------------
function makeFish(o) {
  const len = o.len, hgt = o.hgt, tail = o.tailLen ?? Math.round(len * 0.25);
  const W = len + 3, H = hgt + 6;
  const cy = Math.floor(H / 2);
  const bx0 = tail, bx1 = len;
  const out = o.outline ?? shade(o.body, -0.55);
  return bake(W, H, (ctx) => {
    const half = (x) => {
      const t = (x - bx0) / (bx1 - bx0);
      const ell = Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2));
      return Math.max(1, Math.round((hgt / 2) * Math.pow(ell, 0.7) * (0.6 + 0.4 * t)));
    };
    // Đuôi
    const tailH = o.tailH ?? Math.round(hgt * 0.55);
    for (let x = 0; x < tail + 1; x++) {
      const k = (tail - x) / tail;
      const spread = Math.round(1 + k * tailH);
      for (let dy = -spread; dy <= spread; dy++) {
        const fork = o.tailType === 'fork' && Math.abs(dy) < spread * k * 0.6 && x < tail * 0.6;
        if (fork) continue;
        rect(ctx, x, cy + dy, 1, 1, Math.abs(dy) === spread || x === 0 ? out : o.fin);
      }
    }
    // Vây lưng
    const d0 = Math.round(bx0 + (bx1 - bx0) * (o.dorsal?.[0] ?? 0.35));
    const d1 = Math.round(bx0 + (bx1 - bx0) * (o.dorsal?.[1] ?? 0.65));
    for (let x = d0; x <= d1; x++) {
      const top = cy - half(x);
      const tall = o.spiny && x % 2 === 0 ? 3 : 2;
      rect(ctx, x, top - tall + 1, 1, tall - 1, o.fin);
      dot(ctx, x, top - tall, out);
    }
    // Thân
    for (let x = bx0; x <= bx1; x++) {
      const h = half(x);
      for (let dy = -h; dy <= h; dy++) {
        let c = dy > h * 0.25 ? o.belly : dy < -h * 0.45 && o.back ? o.back : o.body;
        if (o.stripes && (x - bx0) % o.stripes === 0 && x > bx0 + 2 && x < bx1 - 3 && dy < h * 0.5) c = shade(o.body, -0.3);
        if (o.scales && (x + dy) % 2 === 0 && dy < h * 0.25 && x < bx1 - 2) c = o.scales;
        if (o.spots && (x * 7 + dy * 13) % o.spots === 0 && dy < h * 0.5) c = shade(o.body, -0.4);
        if (o.patches && o.patches.some(([px, py, r]) => (x - bx0 - px) ** 2 + (dy - py) ** 2 <= r * r)) c = o.patchColor;
        if (Math.abs(dy) === h || x === bx1) c = out;
        dot(ctx, x, cy + dy, c);
      }
    }
    // Vây bụng
    const pv = Math.round(bx0 + (bx1 - bx0) * 0.55);
    rect(ctx, pv, cy + half(pv) + 1, 2, 1, o.fin);
    // Mắt + miệng
    const ex = bx1 - Math.max(2, Math.round(len * 0.12));
    const ey = cy - Math.max(1, Math.round(half(ex) * 0.35));
    dot(ctx, ex, ey, '#111111');
    dot(ctx, ex - 1, ey, o.eyeRing ?? '#ffffff');
    dot(ctx, bx1, cy + 1, shade(out, -0.3));
    // Râu
    if (o.whiskers) {
      for (let i = 1; i <= o.whiskers; i++) {
        dot(ctx, bx1 + Math.min(i, 2), cy + 1 + i, o.whiskerColor ?? out);
      }
    }
    if (o.extra) o.extra(ctx, { bx0, bx1, cy, W, H, out });
  });
}

const FISH_DEFS = {
  ca_ro: { len: 13, hgt: 7, body: '#6f8f3c', belly: '#d2c77c', fin: '#8b6b3a', tailType: 'round', spiny: true, stripes: 3 },
  ca_tre: { len: 17, hgt: 6, body: '#4b4f5c', belly: '#b3aca2', fin: '#3a3d47', tailType: 'round', dorsal: [0.3, 0.9], whiskers: 3, whiskerColor: '#2a2c33' },
  ca_loc: { len: 19, hgt: 6, body: '#5d5b3a', belly: '#dcd6b6', fin: '#47452b', tailType: 'round', dorsal: [0.15, 0.95], spots: 5 },
  ca_chep: { len: 15, hgt: 8, body: '#d39a35', belly: '#f3dc8c', fin: '#c0702a', tailType: 'fork', scales: '#e8b956', whiskers: 1 },
  ca_ro_phi: { len: 14, hgt: 8, body: '#71879a', belly: '#c9d3da', fin: '#cf5a48', tailType: 'fork', stripes: 2, spiny: true },
  ca_tra: { len: 23, hgt: 8, body: '#8d9aa8', back: '#4f5d6c', belly: '#e6ebef', fin: '#6e7b8a', tailType: 'fork', tailH: 6, whiskers: 2 },
  ca_koi: { len: 16, hgt: 7, body: '#f6f1e6', belly: '#ffffff', fin: '#f4c9b4', tailType: 'round', tailH: 5, outline: '#7a4a3a',
    patches: [[3, -2, 2], [8, -1, 2], [11, 1, 1]], patchColor: '#e9502c' },
  ca_ho: { len: 23, hgt: 11, body: '#b4c0aa', back: '#6c7b63', belly: '#eef0e2', fin: '#c4775a', tailType: 'fork', tailH: 7, scales: '#d1dac6' },
  ca_rong: { len: 23, hgt: 7, body: '#e6b443', belly: '#fbe6a2', fin: '#d8452e', tailType: 'round', tailH: 5, scales: '#fff0a6',
    dorsal: [0.6, 0.95], outline: '#7a4a10', whiskers: 2, whiskerColor: '#d8452e' },
  ca_chep_hoa_rong: { len: 24, hgt: 9, body: '#e0482a', belly: '#ffd36b', fin: '#ff9a2e', tailType: 'fork', tailH: 7, scales: '#ffc04a',
    outline: '#6a1a0a', spiny: true,
    extra(ctx, { bx1, cy }) {
      // Sừng rồng và râu dài bay ngược
      dot(ctx, bx1 - 4, cy - 6, '#ffe27a'); dot(ctx, bx1 - 5, cy - 7, '#ffe27a'); dot(ctx, bx1 - 6, cy - 8, '#fff6c8');
      dot(ctx, bx1 - 2, cy - 5, '#ffe27a'); dot(ctx, bx1 - 3, cy - 6, '#fff6c8');
      for (let i = 0; i < 5; i++) dot(ctx, bx1 - i, cy + 3 + (i % 2), '#ffe27a');
    } },
  generic: { len: 14, hgt: 7, body: '#4f8fc0', belly: '#cfe6f2', fin: '#3a6f9a', tailType: 'fork' },
};

// ---- Lưới vẽ tay ------------------------------------------------------------
const GRIDS = {
  dep_to_ong: {
    pal: { k: '#2b4a6e', b: '#7fb6e6', h: '#3f74a8', s: '#f2f6fb' },
    rows: [
      '..kkkkkkkkkk..',
      '.kbhbbsshbbhbk',
      'kbbbbbssbbbbbk',
      'kbhbbhssbhbbhk',
      'kbbbbbssbbbbbk',
      '.kbhbbsshbbhbk',
      '..kkkkkkkkkk..',
    ],
  },
  non_bao_hiem: {
    pal: { k: '#3a2a12', y: '#f2c230', w: '#fff4c2', r: '#d6452c', d: '#b8891c', s: '#333333' },
    rows: [
      '.....kkkkkk.....',
      '...kkyyyyyykk...',
      '..kywwyyyyyyyk..',
      '.kywyyyyyyyyyyk.',
      '.kyyyyyyyyyyyyk.',
      '.krrrrrrrrrrrrk.',
      '.kyyyyyyyyyyyyk.',
      'kddddddddddddddk',
      '.kkkkkkkkkkkkkk.',
      '...s.......s....',
      '....sssssss.....',
    ],
  },
  so_no: {
    pal: { k: '#3a1a14', R: '#9c2b22', w: '#f4ead2', x: '#3a1a14', g: '#f2c230', p: '#e9dcc0' },
    rows: [
      'kkkkkkkkkkk.',
      'kRRRRRRRRRkk',
      'kRwwwwwwwRkp',
      'kRwxxwxxwRkp',
      'kRwwwwwwwRkp',
      'kRRRRRRRRRkp',
      'kRRRggRRRRkp',
      'kRRgRRgRRRkp',
      'kRRRggRRRRkp',
      'kRRRRRRRRRkp',
      'kkkkkkkkkkkp',
      '.ppppppppppp',
    ],
  },
  thu_tinh: {
    pal: { k: '#8a6a5a', w: '#fbf3e4', h: '#e2445c' },
    rows: [
      'kkkkkkkkkkkkkk',
      'kkwwwwwwwwwwkk',
      'kwkwwwwwwwwkwk',
      'kwwkwwwwwwkwwk',
      'kwwwkhhwhhkwwk',
      'kwwwwhhkhhwwwk',
      'kwwwwwkhhwwwwk',
      'kwwwwwwhwwwwwk',
      'kwwwwwwwwwwwwk',
      'kkkkkkkkkkkkkk',
    ],
  },
  lon_nuoc: {
    pal: { k: '#4a2020', S: '#c9ced6', r: '#d93a3a', w: '#ffffff', d: '#a52828' },
    rows: [
      '.kkkkkkkkkkkk.',
      'kSrrrrrrrrrrSk',
      'kSrrwwrrrrrrSk',
      'kSwwrrwwrrwwSk',
      'kSrrrrrrwwrrSk',
      'kSrrrrrrrrrrSk',
      'kSddddddddddSk',
      '.kkkkkkkkkkkk.',
    ],
  },
  tom_cang: {
    pal: { k: '#1f3f6a', b: '#4f8fd6', C: '#2f6fc0', e: '#111111', f: '#8fbbe8', a: '#e07a5a', l: '#e07a5a' },
    rows: [
      '..........aaaa..',
      '.......kkkk...a.',
      '..kkkkkbbbbk....',
      '.kbbkbbkbbbbekCC',
      'kfkbbkbbkbbbbkCC',
      'kffkbbkbbkbbbk.C',
      '.kk.kkbbkkkkk...',
      '.....l.l.l.l....',
    ],
  },
  rua_vang: {
    pal: { k: '#5a3a10', G: '#f2c84a', g: '#c9922a', d: '#a8741e', S: '#b9c25a', e: '#111111' },
    rows: [
      '.....kkkkkk.......',
      '...kkGGgGGGkk.....',
      '..kGgGGGgGGgGk....',
      '.kGGGgGGGgGGGGk...',
      '.kgGGGgGGGgGGgkSSk',
      'kddddddddddddddSek',
      '.kSSk......kSSk...',
      '.kkk.......kkk....',
    ],
  },
};

// Cá chình: thân dài uốn lượn, vẽ riêng.
function makeEel() {
  return bake(26, 9, (ctx) => {
    for (let x = 0; x < 24; x++) {
      const y = 4 + Math.round(Math.sin(x / 3.2) * 1.6);
      const thick = x < 3 ? 1 : 2;
      dot(ctx, x, y - thick, '#3b3015');
      for (let t = -thick + 1; t <= thick - 1; t++) dot(ctx, x, y + t, t > 0 ? '#c8b26a' : '#6a5a2c');
      dot(ctx, x, y + thick, '#3b3015');
    }
    const hy = 4 + Math.round(Math.sin(23 / 3.2) * 1.6);
    dot(ctx, 22, hy - 1, '#111111');
    dot(ctx, 24, hy, '#3b3015');
  });
}

const baked = new Map();
function bakedFor(id) {
  if (!baked.has(id)) {
    let c;
    if (GRIDS[id]) c = bakeGrid(GRIDS[id].rows, GRIDS[id].pal);
    else if (id === 'ca_chinh') c = makeEel();
    else c = makeFish(FISH_DEFS[id] ?? FISH_DEFS.generic);
    baked.set(id, c);
  }
  return baked.get(id);
}

// opts.scale: phóng nguyên lần; opts.maxWidth: giảm hệ số (tối thiểu 1) để hình không rộng quá.
function drawBaked(id) {
  return (ctx, x, y, { flip = false, scale = 1, maxWidth = Infinity } = {}) => {
    const c = bakedFor(id);
    const s = Math.max(1, Math.min(scale, Math.floor(maxWidth / c.width)));
    const w = c.width * s, h = c.height * s;
    const left = Math.round(x - w / 2), top = Math.round(y - h / 2);
    if (!flip) { ctx.drawImage(c, left, top, w, h); return; }
    ctx.save();
    ctx.translate(left + w, top);
    ctx.scale(-1, 1);
    ctx.drawImage(c, 0, 0, w, h);
    ctx.restore();
  };
}

// Đăng ký sprite cho mọi id trong config (id lạ dùng hình cá chung).
export function registerFishSprites(fishList) {
  registerSprite('fish.generic', drawBaked('generic'));
  for (const f of fishList) registerSprite(f.sprite ?? `fish.${f.id}`, drawBaked(f.id));
}
