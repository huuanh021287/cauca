// Popup kết quả câu cá trên #hud. Hàng đợi ở hudLogic.js (tối đa ui.maxPopups cái, mỗi cái ui.popupSec giây).
// Bậc càng cao càng to và nổi: rác xám kèm câu đùa, thường gỗ trắng, hiếm xanh dương, sử thi tím lấp lánh,
// huyền thoại sơn mài đỏ viền vàng chiếm cả chiều ngang (kèm pháo hoa to, do overlay kích hoạt).

import { createPopupQueue, popupContent } from '../hudLogic.js';
import { drawOutlinedText, FONT_PIXEL, INK } from '../text.js';
import { drawSprite, hasSprite } from '../sprites/registry.js';
import { pixelPanel, drawIcon } from './panel.js';

const STYLE = {
  trash: { w: 720, h: 124, fill: '#4a4d52', rim: '#8a8d90', light: '#5e6166', dark: '#2e3034', text: '#dcdcd2', size: 46, fish: 4 },
  common: { w: 740, h: 112, fill: '#6b4226', rim: '#c48a48', light: '#835430', dark: '#4a2a14', text: '#fff3d6', size: 52, fish: 4 },
  rare: { w: 800, h: 116, fill: '#123e6e', rim: '#4fb4ff', light: '#1d5a98', dark: '#0a2747', text: '#9fe0ff', size: 54, fish: 4 },
  epic: { w: 880, h: 124, fill: '#3d1a5c', rim: '#c77dff', light: '#56287f', dark: '#26103b', text: '#ecc8ff', size: 58, fish: 5 },
  legendary: { w: 1032, h: 196, fill: '#8e1a16', rim: '#ffd23a', light: '#b3261f', dark: '#5e0f0c', text: '#ffd23a', size: 84, fish: 6 },
};
const GAP = 8;
const RIBBON = 24;
const IN_MS = 200, OUT_MS = 260;

export function createPopups(config, { band, onStart } = {}) {
  const ui = config.ui;
  const fishSprite = new Map(config.fish.map((f) => [f.id, f.sprite ?? `fish.${f.id}`]));
  const queue = createPopupQueue({ maxVisible: ui.maxPopups, durationMs: ui.popupSec * 1000, maxPending: 10 });
  const cx = ui.width / 2;

  function onEvents(events, now) {
    for (const ev of events) {
      if (ev?.kind === 'catch') queue.push(popupContent(ev, { nameMax: ui.nameMaxChars }), now);
    }
  }

  function spriteFor(p) {
    const id = fishSprite.get(p.fishId);
    return id && hasSprite(id) ? id : 'fish.generic';
  }

  function drawFish(ctx, p, x, y, scale, flip = false) {
    drawSprite(ctx, spriteFor(p), x, y, { scale, maxWidth: 150, flip });
  }

  function drawBody(ctx, p, x, y, st, now) {
    const { w, h } = st;
    pixelPanel(ctx, x, y, w, h, { fill: st.fill, rim: st.rim, light: st.light, dark: st.dark });
    if (p.tier === 'epic' || p.tier === 'legendary') drawShimmer(ctx, x, y, w, h, now - p.startedAt, p.tier);

    if (p.tier === 'legendary') {
      // Dải băng "HUYỀN THOẠI" đè lên mép trên, hai con cá đối xứng hai bên.
      const tagW = 300;
      pixelPanel(ctx, cx - tagW / 2, y - RIBBON, tagW, 48, { fill: '#ffd23a', rim: '#fff6c8', dark: '#c98a12' });
      drawOutlinedText(ctx, 'HUYỀN THOẠI', cx, y + 12, { font: FONT_PIXEL, size: 44, weight: 400, color: '#8e1a16', outline: '#fff6c8', width: 0, align: 'center' });
      drawFish(ctx, p, x + 104, y + h / 2 + 8, st.fish);
      drawFish(ctx, p, x + w - 104, y + h / 2 + 8, st.fish, true);
      const tw = w - 2 * 200;
      drawOutlinedText(ctx, p.line1, cx, y + 74, { size: 30, color: '#fff3d6', outline: INK, width: 7, align: 'center', maxWidth: tw });
      drawOutlinedText(ctx, p.line2, cx, y + 164, {
        font: FONT_PIXEL, size: st.size, weight: 400, color: st.text, outline: INK, width: 12, align: 'center', maxWidth: tw, shadow: '#3a0806',
      });
      return;
    }

    const fishBox = 150;
    drawFish(ctx, p, x + 20 + fishBox / 2, y + h / 2, st.fish);
    const tx = x + 20 + fishBox + 12, tw = w - (tx - x) - 28;
    if (p.tier === 'trash') {
      drawOutlinedText(ctx, p.line1, tx, y + 34, { size: 24, color: '#e8e8e0', outline: INK, width: 6, maxWidth: tw });
      drawOutlinedText(ctx, p.line2, tx, y + 80, { font: FONT_PIXEL, size: st.size, weight: 400, color: st.text, outline: INK, width: 9, maxWidth: tw });
      drawOutlinedText(ctx, p.joke, tx, y + 108, { size: 21, weight: 500, color: '#b8b8ae', outline: INK, width: 5, maxWidth: tw });
      return;
    }
    drawOutlinedText(ctx, p.line1, tx, y + 36, { size: 25, color: '#fff3d6', outline: INK, width: 6, maxWidth: tw });
    drawOutlinedText(ctx, p.line2, tx, y + h - 18, {
      font: FONT_PIXEL, size: st.size, weight: 400, color: st.text, outline: INK, width: 10, maxWidth: tw,
    });
  }

  // Vệt sáng chéo quét ngang (sử thi/huyền thoại) + đốm lấp lánh nhảy quanh viền.
  function drawShimmer(ctx, x, y, w, h, age, tier) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 8, y + 8, w - 16, h - 16);
    ctx.clip();
    const sweep = ((age % 1400) / 1400) * (w + h * 2) - h;
    ctx.fillStyle = tier === 'legendary' ? 'rgba(255,230,140,0.18)' : 'rgba(236,200,255,0.16)';
    for (let k = 0; k < h; k += 4) ctx.fillRect(x + sweep + k * 0.6, y + k, 36, 4);
    ctx.restore();
    const n = tier === 'legendary' ? 10 : 6;
    for (let i = 0; i < n; i++) {
      if ((Math.floor(age / 140) + i) % 3) continue;
      const t = (i * 0.618 + 0.13) % 1;
      const onTop = i % 2 === 0;
      const sx = x + 16 + t * (w - 40);
      const sy = onTop ? y - 6 : y + h - 14;
      drawIcon(ctx, 'sparkle', sx, sy, 4);
    }
  }

  function draw(ctx, now) {
    for (const p of queue.update(now)) onStart?.(p);
    const items = queue.active;
    if (!items.length) return;
    ctx.imageSmoothingEnabled = false;
    // Xếp chồng từ dưới band lên; cái mới nằm dưới cùng (gần bến), cái cũ đẩy lên.
    const extra = (p) => (p.tier === 'legendary' ? RIBBON : 0); // chừa chỗ cho dải băng nhô lên
    let total = 0;
    for (const p of items) total += extra(p) + STYLE[p.tier].h + GAP;
    let top = band.bottom - total + GAP;
    for (const p of items) {
      const st = STYLE[p.tier];
      top += extra(p);
      p.y = p.y === undefined ? top : p.y + (top - p.y) * 0.25;
      top += st.h + GAP;
      const age = now - p.startedAt, left = p.endsAt - now;
      let scale = 1, alpha = 1, lift = 0;
      if (age < IN_MS) {
        const k = age / IN_MS;
        scale = k < 0.7 ? 0.7 + (1.06 - 0.7) * (k / 0.7) : 1.06 - 0.06 * ((k - 0.7) / 0.3);
      }
      if (left < OUT_MS) { alpha = Math.max(0, left / OUT_MS); lift = (1 - alpha) * 16; }
      const x = cx - st.w / 2, y = Math.round(p.y - lift);
      ctx.save();
      ctx.globalAlpha = alpha;
      if (scale !== 1) {
        ctx.translate(cx, y + st.h / 2);
        ctx.scale(scale, scale);
        ctx.translate(-cx, -(y + st.h / 2));
      }
      drawBody(ctx, p, x, y, st, now);
      ctx.restore();
    }
  }

  return { onEvents, draw, queue };
}
