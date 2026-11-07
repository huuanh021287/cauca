// Bộ dựng file Lottie (bodymovin, định dạng JSON) bằng code: không cần After Effects.
// Mỗi hiệu ứng là một hàm thuần, sinh cùng một kết quả cho cùng một tên (hạt ngẫu nhiên có hạt giống cố định).
// Thời gian tính bằng khung hình (FR = 30); toạ độ tính bằng px của khung hình hiệu ứng.

export const FR = 30;

// Số ngẫu nhiên có hạt giống (mulberry32): kết quả lặp lại được, file JSON không đổi giữa các lần sinh.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashName(name) {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

// Màu hex → [r,g,b,a] trong khoảng 0..1 (Lottie dùng dạng này).
export function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
}

const EASE = { i: { x: [0.33], y: [1] }, o: { x: [0.67], y: [0] } };

// Thuộc tính có keyframe: points = [[khung, giá trị], ...]. Một điểm = giá trị tĩnh.
export function prop(points) {
  if (points.length === 1) return { a: 0, k: points[0][1] };
  return {
    a: 1,
    k: points.map(([t, v], i) => {
      const s = Array.isArray(v) ? v : [v];
      return i === points.length - 1 ? { t, s } : { t, s, ...EASE };
    }),
  };
}

const IDENTITY = { p: [0, 0], s: [100, 100], r: 0, o: 100 };

function transform({ pos = [[0, [0, 0]]], scale = [[0, [100, 100]]], rot = [[0, 0]], op = [[0, 100]] } = {}) {
  return { o: prop(op), r: prop(rot), p: prop(pos), a: { a: 0, k: [0, 0, 0] }, s: prop(scale) };
}

// Nhóm hình học: items là các shape (el/rc/sr/fl/st), offset là vị trí cục bộ của nhóm.
function group(items, { offset = [0, 0], rot = 0 } = {}) {
  return {
    ty: 'gr', nm: 'g',
    it: [
      ...items,
      {
        ty: 'tr', nm: 't',
        p: { a: 0, k: offset }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] },
        r: { a: 0, k: rot }, o: { a: 0, k: 100 },
      },
    ],
  };
}

export function ellipse(size) { return { ty: 'el', nm: 'e', d: 1, p: { a: 0, k: [0, 0] }, s: prop(size) }; }
export function rect(w, h, radius = 0) { return { ty: 'rc', nm: 'r', d: 1, p: { a: 0, k: [0, 0] }, s: { a: 0, k: [w, h] }, r: { a: 0, k: radius } }; }
export function star(outer, inner, points = 4) {
  return {
    ty: 'sr', nm: 's', sy: 1, d: 1, pt: { a: 0, k: points }, p: { a: 0, k: [0, 0] }, r: { a: 0, k: 0 },
    ir: { a: 0, k: inner }, is: { a: 0, k: 0 }, or: { a: 0, k: outer }, os: { a: 0, k: 0 },
  };
}
export function fill(hex, opacity = [[0, 100]]) { return { ty: 'fl', nm: 'f', c: { a: 0, k: rgb(hex) }, o: prop(opacity), r: 1 }; }
export function stroke(hex, width, opacity = [[0, 100]]) {
  return { ty: 'st', nm: 's', c: { a: 0, k: rgb(hex) }, o: prop(opacity), w: prop(width), lc: 2, lj: 2 };
}

// Một lớp hình: items là các nhóm, tr mô tả chuyển động của cả lớp.
function layer(ind, name, groups, tr, frames) {
  return { ddd: 0, ind, ty: 4, nm: name, sr: 1, ks: transform(tr), ao: 0, shapes: groups, ip: 0, op: frames, st: 0, bm: 0 };
}

// Đường bay có trọng lực: vị trí tại thời điểm ts (giây) = p0 + v*ts + ½g*ts².
// Lấy mẫu vài khung để Lottie nội suy mượt quanh đường cong.
function arc(x0, y0, vx, vy, g, life, samples = 5) {
  const pts = [];
  for (let k = 0; k < samples; k++) {
    const t = Math.round((life * k) / (samples - 1));
    const ts = t / FR;
    pts.push([t, [x0 + vx * ts, y0 + vy * ts + 0.5 * g * ts * ts]]);
  }
  return pts;
}

// Hạt bay: hình (group), đường bay, xoay, mờ dần ở cuối đời.
// shapes: danh sách shape (được bọc vào một nhóm) hoặc danh sách nhóm sẵn có (ty 'gr').
function particle(name, ind, shapes, { x0, y0, vx, vy, g = 240, life, spin = 0, fadeAt = 0.6, scaleTo = 0.6 }) {
  const fadeFrame = Math.round(life * fadeAt);
  const groups = shapes[0]?.ty === 'gr' ? shapes : [group(shapes)];
  return layer(ind, name, groups, {
    pos: arc(x0, y0, vx, vy, g, life),
    rot: [[0, 0], [life, spin]],
    op: [[0, 100], [fadeFrame, 100], [life, 0]],
    scale: [[0, [100, 100]], [life, [100 * scaleTo, 100 * scaleTo]]],
  }, life);
}

function doc(name, w, h, frames, layers) {
  return { v: '5.7.4', fr: FR, ip: 0, op: frames, w, h, nm: name, ddd: 0, assets: [], layers };
}

// ---- Hiệu ứng ----

// Gợn nước + giọt bắn: dùng khi phao chạm mặt nước (thả cần, cá cắn, kéo cá).
export function splash() {
  const frames = 27, cx = 50, cy = 50, layers = [];
  let ind = 1;
  // Hai vòng gợn lan rộng, vòng sau trễ hơn
  for (const delay of [0, 6]) {
    layers.push(layer(ind++, 'ring', [group([
      ellipse([[delay, [4, 4]], [frames, [72, 72]]]),
      stroke('#e6f7ff', [[delay, 2.2], [frames, 0.4]], [[delay, 0], [delay + 3, 100], [frames, 0]]),
    ])], { pos: [[0, [cx, cy]]], scale: [[0, [100, 100]]] }, frames));
  }
  // Giọt nước bắn lên rồi rơi
  const rng = mulberry32(7);
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI * (0.15 + 0.7 * (i / 8));
    const speed = 85 + rng() * 45;
    layers.push(particle('drop', ind++, [ellipse([[0, [3.2, 3.2]]]), fill('#cdefff')], {
      x0: cx, y0: cy + 4, vx: Math.cos(a) * speed * 0.7, vy: Math.sin(a) * speed, g: 330, life: 24, fadeAt: 0.5, scaleTo: 0.5,
    }));
  }
  return doc('splash', 100, 100, frames, layers);
}

// Vụn "ăn mừng" theo bậc: độ dày, màu, hình và tốc độ tăng dần theo bậc.
const BURST = {
  common: { n: 14, life: 36, colors: ['#ffd23a', '#fff3d6', '#ff8fa3'], speed: [60, 140], shape: 'rect', seed: 11 },
  rare: { n: 22, life: 45, colors: ['#4fb4ff', '#9fe0ff', '#ffffff'], speed: [80, 180], shape: 'star', seed: 23 },
  epic: { n: 32, life: 54, colors: ['#c77dff', '#ecc8ff', '#ffd23a'], speed: [90, 220], shape: 'mix', seed: 37 },
  legendary: { n: 80, life: 66, colors: ['#ffd23a', '#fff6c8', '#ff5a3a', '#ffffff'], speed: [110, 280], shape: 'mix', seed: 53 },
};

export function burst(tier) {
  const cfg = BURST[tier];
  const cx = 80, cy = 80, rng = mulberry32(cfg.seed);
  const layers = [];
  let ind = 1;
  if (tier === 'legendary' || tier === 'epic') {
    // Vòng sáng nổ ra một lần
    // Huyền thoại: hai vòng sáng nổ liên tiếp, vòng sau trễ 8 khung
    for (const delay of tier === 'legendary' ? [0, 8] : [0]) {
      layers.push(layer(ind++, 'shock', [group([
        ellipse([[delay, [10, 10]], [delay + 24, [160, 160]]]),
        stroke(tier === 'legendary' ? '#ffd23a' : '#c77dff', [[delay, 7], [delay + 24, 0.5]], [[delay, 100], [delay + 24, 0]]),
      ])], { pos: [[0, [cx, cy]]] }, cfg.life));
    }
  }
  for (let i = 0; i < cfg.n; i++) {
    const a = rng() * Math.PI * 2;
    const speed = cfg.speed[0] + rng() * (cfg.speed[1] - cfg.speed[0]);
    const color = cfg.colors[i % cfg.colors.length];
    const useStar = cfg.shape === 'star' || (cfg.shape === 'mix' && i % 3 === 0);
    const shape = useStar ? star(4 + rng() * 3, 1.6, 4) : rect(5 + rng() * 3, 2.6 + rng() * 1.4, 1);
    layers.push(particle(useStar ? 'spark' : 'confetti', ind++, [shape, fill(color)], {
      x0: cx, y0: cy, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - speed * 0.25,
      g: 260, life: cfg.life, spin: (rng() < 0.5 ? -1 : 1) * (360 + rng() * 540),
    }));
  }
  return doc(`burst_${tier}`, 160, 160, cfg.life, layers);
}

// Tia sáng xoay quanh màn hình (huyền thoại): nền cho cú nổ lớn.
export function rays() {
  const frames = 60, cx = 170, cy = 170, n = 14, layers = [];
  layers.push(layer(1, 'glow', [group([ellipse([[0, [40, 40]], [14, [200, 200]], [60, [240, 240]]]), fill('#fff6c8', [[0, 0], [10, 34], [45, 22], [60, 0]])])],
    { pos: [[0, [cx, cy]]] }, frames));
  for (let i = 0; i < n; i++) {
    const base = (360 / n) * i;
    layers.push(layer(i + 2, 'ray', [group([rect(9, 150, 5), fill(i % 2 ? '#ffd23a' : '#fff6c8')], { offset: [0, -80] })], {
      pos: [[0, [cx, cy]]],
      rot: [[0, base], [frames, base + 120]],
      op: [[0, 0], [8, 42], [42, 30], [frames, 0]],
    }, frames));
  }
  return doc('rays', 340, 340, frames, layers);
}

// Mưa vụn rơi từ trên xuống cả màn hình (huyền thoại), có đung đưa sang hai bên.
export function rain() {
  const W = 270, H = 480, frames = 150, n = 70, rng = mulberry32(91), layers = [];
  for (let i = 0; i < n; i++) {
    const x0 = rng() * W, y0 = -30 - rng() * 220, fall = 90 + rng() * 70, sway = 10 + rng() * 14;
    const pos = [];
    for (let k = 0; k < 7; k++) {
      const t = Math.round((frames * k) / 6);
      const ts = t / FR;
      pos.push([t, [x0 + Math.sin(ts * 2.4 + i) * sway, y0 + fall * ts]]);
    }
    const color = ['#ffd23a', '#ff5a3a', '#ffffff', '#ff8fa3', '#4fb4ff'][i % 5];
    const shape = i % 4 === 0 ? star(4, 1.8, 4) : rect(4 + rng() * 2, 2.4, 1);
    layers.push(layer(i + 1, 'rain', [group([shape, fill(color)])], {
      pos, rot: [[0, rng() * 90], [frames, 540 + rng() * 360]],
      op: [[0, 100], [frames - 24, 100], [frames, 0]],
    }, frames));
  }
  return doc('rain', W, H, frames, layers);
}

// Lên cấp: các ngôi sao vàng bay lên tỏa ra, kèm vòng sáng.
export function levelup() {
  const frames = 45, cx = 60, cy = 80, layers = [];
  layers.push(layer(1, 'ring', [group([ellipse([[0, [8, 8]], [30, [110, 110]]]), stroke('#ffe9a0', [[0, 4], [30, 0.5]], [[0, 100], [30, 0]])])],
    { pos: [[0, [cx, cy]]] }, frames));
  const rng = mulberry32(137);
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i - 3) * 0.45;
    const speed = 70 + rng() * 40;
    layers.push(particle('star', i + 2, [star(6, 2.4, 5), fill(i % 2 ? '#ffd23a' : '#fff6c8')], {
      x0: cx, y0: cy, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, g: -40, life: frames, spin: 360 * (i % 2 ? 1 : -1),
      fadeAt: 0.55, scaleTo: 0.4,
    }));
  }
  return doc('levelup', 120, 120, frames, layers);
}

// Tim bay lên (tặng quà, follow, share).
function heartShape(color) {
  return [
    group([ellipse([[0, [14, 14]]]), fill(color)], { offset: [-6.5, -3] }),
    group([ellipse([[0, [14, 14]]]), fill(color)], { offset: [6.5, -3] }),
    group([rect(12.5, 12.5, 2), fill(color)], { offset: [0, 2], rot: 45 }),
  ];
}

export function hearts() {
  const frames = 60, cx = 60, cy = 128, layers = [];
  const rng = mulberry32(173);
  const colors = ['#ff5d8f', '#ff8fb1', '#ffb3c7', '#ff3d7a'];
  for (let i = 0; i < 8; i++) {
    const x0 = cx + (rng() - 0.5) * 60, vy = -(60 + rng() * 30);
    layers.push(particle('heart', i + 1, heartShape(colors[i % colors.length]), {
      x0, y0: cy, vx: (rng() - 0.5) * 20, vy, g: 0, life: frames, spin: (rng() - 0.5) * 40, fadeAt: 0.5, scaleTo: 0.9,
    }));
  }
  return doc('hearts', 120, 140, frames, layers);
}

// Khói/bọt trắng phình ra rồi tan: người mới ngồi bến, cá thoát.
export function poof() {
  const frames = 30, cx = 50, cy = 50, layers = [];
  const rng = mulberry32(211);
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI * 2 * i) / 6 + rng() * 0.5;
    const d = 8 + rng() * 6;
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.6;
    const big = 18 + rng() * 10;
    layers.push(layer(i + 1, 'puff', [group([ellipse([[0, [4, 4]], [frames, [big, big]]]), fill('#f5f7fa', [[0, 80], [frames - 8, 60], [frames, 0]])])],
      { pos: [[0, [x, y]]] }, frames));
  }
  return doc('poof', 100, 100, frames, layers);
}

export const ANIMATIONS = {
  splash, burst_common: () => burst('common'), burst_rare: () => burst('rare'), burst_epic: () => burst('epic'),
  burst_legendary: () => burst('legendary'), rays, rain, levelup, hearts, poof,
};
