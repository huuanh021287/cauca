// Vẽ cảnh nền lên canvas low-res: trời theo buổi, mây trôi, núi, đồi ruộng, cây, mặt hồ gợn sóng,
// bóng cá bơi, sen, bến gỗ, đom đóm. Phần tĩnh được vẽ sẵn theo từng buổi để mỗi khung hình nhẹ.

import { drawSprite } from '../sprites/registry.js';
import { PALETTES, drawHills } from '../sprites/scene.js';
import { rect, dot, bake } from '../sprites/pixel.js';

export const SHORE_Y = 196;     // đường mép nước (low-res)

const SUN = { day: { x: 38, y: 132, r: 8, color: '#fff3b0' }, dusk: { x: 140, y: 138, r: 15, color: '#ffd77a' } };
const MOON = { x: 240, y: 118 };
const LOTUS = [[14, 232, true], [252, 238, false], [8, 318, true], [262, 322, false], [20, 404, false],
  [118, 432, true], [206, 446, false], [62, 458, true], [250, 420, true]];
const CLOUDS = [{ y: 52, speed: 2.2, off: 20 }, { y: 84, speed: 1.4, off: 160 }, { y: 112, speed: 3, off: 90 }];

// Số giả ngẫu nhiên ổn định theo chỉ số (không dùng Math.random để cảnh không nhảy).
const noise = (i) => {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

const cache = new Map();

function bakeBackground(w, h, phase) {
  const p = PALETTES[phase];
  return bake(w, h, (ctx) => {
    // Trời: các dải màu, ranh giới giữa hai dải được hòa bằng chấm ô cờ
    const band = Math.ceil(SHORE_Y / p.sky.length);
    p.sky.forEach((c, i) => rect(ctx, 0, i * band, w, band, c));
    for (let i = 1; i < p.sky.length; i++) {
      for (let x = 0; x < w; x++) for (let k = 0; k < 2; k++) {
        if ((x + k) % 2 === 0) dot(ctx, x, i * band - 1 - k, p.sky[i]);
      }
    }
    if (SUN[phase]) drawSprite(ctx, 'scene.sun', SUN[phase].x, SUN[phase].y, SUN[phase]);
    if (phase === 'night') drawSprite(ctx, 'scene.moon', MOON.x, MOON.y, { phase });
    drawSprite(ctx, 'scene.mountain', 0, SHORE_Y - 74, { w, h: 52, phase });
    drawHills(ctx, SHORE_Y, w, { phase });
    drawSprite(ctx, 'scene.hut', 176, SHORE_Y - 12, { phase });
    // Mặt hồ
    const depth = h - SHORE_Y;
    const bands = [0.08, 0.3, 0.62, 1].map((f) => Math.round(SHORE_Y + depth * f));
    let top = SHORE_Y;
    p.water.forEach((c, i) => { rect(ctx, 0, top, w, bands[i] - top, c); top = bands[i]; });
    for (let i = 0; i < 3; i++) {
      for (let x = 0; x < w; x += 2) dot(ctx, x + (bands[i] % 2), bands[i], p.water[i]);
    }
    rect(ctx, 0, SHORE_Y, w, 1, p.ripple);
    // Cây ven bờ (vẽ sau nước để gốc chạm mép hồ)
    drawSprite(ctx, 'scene.tree', 232, SHORE_Y + 2, { kind: 'bamboo', phase });
    drawSprite(ctx, 'scene.tree', 22, SHORE_Y + 3, { kind: 'coconut', h: 62, lean: 10, phase });
    drawSprite(ctx, 'scene.tree', 252, SHORE_Y + 4, { kind: 'coconut', h: 54, lean: -9, phase });
    drawSprite(ctx, 'scene.tree', 44, SHORE_Y + 1, { kind: 'bamboo', stalks: [[0, 34, -1], [3, 40, 1], [6, 30, 2]], phase });
  });
}

function background(w, h, phase) {
  const key = `${phase}:${w}x${h}`;
  if (!cache.has(key)) cache.set(key, bakeBackground(w, h, phase));
  return cache.get(key);
}

function drawStars(ctx, w, t) {
  for (let i = 0; i < 46; i++) {
    const x = Math.floor(noise(i) * w), y = Math.floor(noise(i + 99) * (SHORE_Y - 80));
    const tw = Math.sin(t / 600 + i * 1.7);
    if (tw > -0.3) dot(ctx, x, y, tw > 0.75 ? '#ffffff' : '#a9b2e8');
  }
}

function drawClouds(ctx, w, t, phase) {
  for (const c of CLOUDS) {
    const span = w + 40;
    const x = ((c.off + (t / 1000) * c.speed) % span) - 20;
    drawSprite(ctx, 'scene.cloud', Math.round(x), c.y, { phase });
  }
}

// Vệt phản chiếu mặt trời / mặt trăng và gợn sóng
function drawWaterLife(ctx, w, h, t, phase) {
  const p = PALETTES[phase];
  const src = phase === 'night' ? MOON : SUN[phase];
  if (src) {
    for (let k = 0; k < 14; k++) {
      const y = SHORE_Y + 3 + k * 3;
      const wob = Math.round(Math.sin(t / 400 + k) * 2);
      const half = Math.max(1, 6 - Math.floor(k / 3));
      if ((k + Math.floor(t / 350)) % 4 !== 0) rect(ctx, src.x - half + wob, y, half * 2, 1, p.glint);
    }
  }
  for (let i = 0; i < 34; i++) {
    const baseY = SHORE_Y + 8 + Math.floor(noise(i + 7) * (h - SHORE_Y - 12));
    const x = (noise(i + 3) * w + t / (900 + i * 37)) % w;
    const phaseT = (t / 1600 + noise(i + 11) * 6) % 6;
    if (phaseT > 3) continue;
    const len = 2 + Math.round(Math.sin((phaseT / 3) * Math.PI) * 3);
    rect(ctx, Math.round(x), baseY, len, 1, p.ripple);
  }
}

// Bóng cá bơi dưới nước
function drawFishShadows(ctx, w, t) {
  const lanes = [222, 244, 306, 334, 392, 452];
  lanes.forEach((y, i) => {
    const dir = i % 2 ? -1 : 1;
    const speed = 6 + noise(i + 40) * 7;
    const span = w + 60;
    let x = ((noise(i + 21) * span + (t / 1000) * speed) % span) - 30;
    if (dir < 0) x = w - x;
    const yy = Math.round(y + Math.sin(t / 1300 + i) * 3);
    ctx.fillStyle = 'rgba(8,24,40,0.28)';
    ctx.fillRect(Math.round(x) - 4, yy - 1, 9, 3);
    ctx.fillRect(Math.round(x) - 3, yy - 2, 7, 5);
    const tail = Math.round(x) - 6 * dir;
    const flap = Math.sin(t / 180 + i) > 0 ? 1 : 0;
    ctx.fillRect(tail - (dir > 0 ? 1 : 0), yy - 1 - flap, 2, 3 + flap);
  });
}

function drawFireflies(ctx, w, t) {
  for (let i = 0; i < 16; i++) {
    const bx = noise(i + 60) * w, by = SHORE_Y - 30 + noise(i + 80) * 70;
    const x = bx + Math.sin(t / 1700 + i * 2.1) * 9;
    const y = by + Math.cos(t / 1300 + i * 1.3) * 6;
    const glow = Math.sin(t / 420 + i * 3.7);
    if (glow < 0) continue;
    ctx.fillStyle = `rgba(230,255,120,${0.25 * glow})`;
    ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
    dot(ctx, x, y, glow > 0.5 ? '#f4ffa0' : '#c8e870');
  }
}

export function drawSceneBack(ctx, w, h, t, phase) {
  ctx.drawImage(background(w, h, phase), 0, 0);
  if (phase === 'night') drawStars(ctx, w, t);
  drawClouds(ctx, w, t, phase);
  drawWaterLife(ctx, w, h, t, phase);
  drawFishShadows(ctx, w, t);
  for (const [x, y, flower] of LOTUS) drawSprite(ctx, 'scene.lotus', x, y, { flower, phase });
}

export function drawDockRow(ctx, w, y, t, phase) {
  drawSprite(ctx, 'scene.dock', 0, y, { w, phase });
  if (phase === 'day') return;
  for (const lx of [5, w - 6]) {
    rect(ctx, lx, y - 14, 1, 12, PALETTES[phase].wood[3]);
    drawSprite(ctx, 'scene.lantern', lx, y - 11, { t, phase });
  }
}

export function drawSceneFront(ctx, w, h, t, phase) {
  if (phase === 'night') drawFireflies(ctx, w, t);
}
