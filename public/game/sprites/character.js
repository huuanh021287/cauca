// Sprite nhân vật chibi (đầu to, thân nhỏ) ngồi trên mép bến, cần câu và hiệu ứng câu cá.
// char.body neo ở mặt bến (giữa cạnh dưới phần thân; chân thả xuống dưới điểm neo).

import { registerSprite } from './registry.js';
import { grid, line, curve, dot, rect, shade } from './pixel.js';

const SKIN = '#f6c89a';
const OUTLINE = '#3a2418';

// 12 cột × 19 hàng; hàng 14 là mông chạm mặt bến (điểm neo y), hàng 15–18 là chân thả xuống.
const BODY = [
  '...KKKKKK...',
  '..KHHHHHHK..',
  '.KHHHHHHHHK.',
  '.KHHHHHHHHK.',
  '.KHSHSSHSHK.',
  '.KSSESSESSK.',
  '.KSCSSSSCSK.',
  '.KSSSSmSSSK.',
  '..KSSSSSSK..',
  '...KKKKKK...',
  '..KTTTTTTK..',
  '.KTtTTTTtTK.',
  '.KSTTTTTTSK.',
  '..KtttttTK..',
  '..KPPPPPPK..',
  '..KPK..KPK..',
  '..KPK..KPK..',
  '..KSK..KSK..',
  '...K....K...',
];

// Nón lá (16 cột), đáy nón đặt ở hàng 4 của đầu.
const NON_LA = [
  '.......KK.......',
  '......KYYK......',
  '.....KYyYYK.....',
  '....KYYYyYYK....',
  '..KKYyYYYYyYKK..',
  'KKYYYYYYyYYYYYKK',
  '.KKKKKKKKKKKKKK.',
];

const HAIRS = ['#2b1d16', '#4a2e1c', '#1c1c24', '#6b3b1f', '#3a2a40'];

function drawBody(ctx, x, y, { shirt = '#4caf50', hair = HAIRS[0], hat = false, blink = false, bob = 0 } = {}) {
  const ox = Math.round(x) - 6, oy = Math.round(y) - 14 + bob;
  const pal = {
    K: OUTLINE, H: hair, S: SKIN, E: blink ? SKIN : '#2a1a14', C: '#f19a9a', m: '#c0605a',
    T: shirt, t: shade(shirt, -0.25), P: '#33415c',
  };
  // Chân không nhấp nhô theo thân
  grid(ctx, BODY.slice(0, 15), pal, ox, oy);
  grid(ctx, BODY.slice(15), pal, ox, Math.round(y) + 1);
  if (blink) line(ctx, ox + 3, oy + 5, ox + 4, oy + 5, '#2a1a14'), line(ctx, ox + 7, oy + 5, ox + 8, oy + 5, '#2a1a14');
  if (hat) grid(ctx, NON_LA, { K: '#6b4a1e', Y: '#e9c873', y: '#c9a24e' }, ox - 2, oy - 3);
}

export function hairFor(hash) {
  return HAIRS[hash % HAIRS.length];
}

// Cần câu: từ tay tới ngọn; bend > 0 làm cần cong xuống (lúc kéo).
function drawRod(ctx, _x, _y, { hand, tip, bend = 0, color = '#8b5a2b' }) {
  const mx = (hand.x + tip.x) / 2, my = (hand.y + tip.y) / 2;
  const cx = mx - bend * 0.4, cy = my - bend;
  const dark = shade(color, -0.45);
  curve(ctx, hand.x, hand.y, cx, cy, tip.x, tip.y, color, 12);
  // Cán cầm
  const dx = tip.x - hand.x, dy = tip.y - hand.y, len = Math.hypot(dx, dy) || 1;
  line(ctx, hand.x, hand.y, hand.x + (dx / len) * 3, hand.y + (dy / len) * 3, dark);
  dot(ctx, hand.x - (dx / len), hand.y - (dy / len), dark);
  dot(ctx, tip.x, tip.y, shade(color, 0.5));
}

// Phao: đỏ trên, trắng dưới. sunk = chìm nửa (cá cắn).
function drawBobber(ctx, x, y, { sunk = false } = {}) {
  x = Math.round(x); y = Math.round(y);
  if (sunk) {
    dot(ctx, x, y, '#e8402e');
    rect(ctx, x - 2, y + 1, 5, 1, 'rgba(255,255,255,0.75)');
    return;
  }
  dot(ctx, x, y - 2, OUTLINE);
  rect(ctx, x - 1, y - 1, 3, 2, '#e8402e');
  rect(ctx, x - 1, y + 1, 3, 1, '#ffffff');
  rect(ctx, x - 2, y + 2, 5, 1, 'rgba(255,255,255,0.45)');
}

// Tia nước: t từ 0 tới 1.
function drawSplash(ctx, x, y, { t = 0 } = {}) {
  if (t < 0 || t > 1) return;
  const r = Math.round(1 + t * 5);
  const a = 1 - t;
  ctx.fillStyle = `rgba(255,255,255,${0.85 * a})`;
  ctx.fillRect(Math.round(x - r), Math.round(y + 1), 2 * r + 1, 1);
  const lift = Math.round(Math.sin(t * Math.PI) * 4);
  for (const dx of [-2, 0, 2]) ctx.fillRect(Math.round(x + dx * (1 + t)), Math.round(y - lift - (dx === 0 ? 1 : 0)), 1, 1);
}

const EXCLAIM = ['KKKK', 'KyyK', 'KyyK', 'KyyK', 'KyyK', 'KKKK', '.KK.', 'KyyK', 'KKKK'];
function drawExclaim(ctx, x, y, { on = true } = {}) {
  grid(ctx, EXCLAIM, { K: '#3a1408', y: on ? '#ffe14a' : '#ff5a3a' }, Math.round(x) - 2, Math.round(y) - 9);
}

// Đầu rồng vàng nhỏ — dấu hiệu lượt câu huyền thoại.
const DRAGON = [
  'r...r..',
  '.rgggk.',
  'gyyyyyk',
  'gykyyrr',
  'gyyyyk.',
  '.gyyk..',
  '..kk...',
];
function drawDragon(ctx, x, y, { glint = false } = {}) {
  grid(ctx, DRAGON, { r: '#e8402e', g: '#c98a12', y: glint ? '#fff2a0' : '#ffd23a', k: '#6a3a06' }, Math.round(x) - 3, Math.round(y) - 3);
}

// Con giun làm mồi.
const WORM = [
  '......kk',
  '.kk..kpe',
  'kppkkppk',
  'kpkppk..',
  '.k.kk...',
];
function drawBait(ctx, x, y) {
  grid(ctx, WORM, { k: '#7a2a3a', p: '#f08aa0', e: '#2a1a14' }, Math.round(x) - 4, Math.round(y) - 2);
}

export function registerCharacterSprites() {
  registerSprite('char.body', drawBody, { anchor: 'bottom' });
  registerSprite('char.rod', drawRod);
  registerSprite('fx.bobber', drawBobber);
  registerSprite('fx.splash', drawSplash);
  registerSprite('fx.exclaim', drawExclaim, { anchor: 'bottom' });
  registerSprite('fx.legendary', drawDragon);
  registerSprite('fx.bait', drawBait);
}
