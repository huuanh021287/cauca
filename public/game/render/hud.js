// Lớp HUD trên #hud: bảng xếp hạng luân phiên + đồng hồ (dải trời ngay dưới safeTop), dòng tin,
// popup kết quả, hướng dẫn + số người chờ (ngay trên safeBottom), pháo hoa.
//
// Bố cục high-res (1080×1920, safeTop 160, safeBottom 260 → vùng dùng được 160..1660):
//   184..432  bảng gỗ xếp hạng (trái) · bảng đồng hồ (phải)
//   438..538  dòng tin (3 dòng)
//   ..784     dải popup, xếp chồng từ dưới lên; 2 popup thường vừa khít dưới dòng tin, popup cao
//             (huyền thoại) đè dòng tin và mép trên nhãn hàng 1 trong vài giây
//   ~754..1570 hai hàng nhân vật (Task 10)
//   1592..1648 hướng dẫn luân phiên + "Đang chờ"
//
// Pháo hoa vẽ trên #hud (ô 4×4 = đúng một pixel của cảnh), giữa bảng/dòng tin và popup: dải trời nơi
// pháo nổ bị bảng gỗ và popup che gần hết, vẽ dưới #pixel thì người xem gần như không thấy.

import { safeRect, SCALE } from '../layout.js';
import {
  createFeed, formatClock, formatKg, hintAt, leaderboardView, queueText, shortName,
} from '../hudLogic.js';
import { drawOutlinedText, measure, FONT_PIXEL, INK } from '../text.js';
import { drawSprite, hasSprite } from '../sprites/registry.js';
import { pixelPanel, drawIcon, iconSize } from './panel.js';
import { createPopups } from './popups.js';
import { createFireworks } from './fx.js';

const WOOD = { fill: '#7a4a24', rim: '#b07a3e', light: '#96602f', dark: '#4a2a14', planks: 32, plankColor: '#6b3f1e' };
const DARK_WOOD = { fill: '#4a2a14', rim: '#8a5a32', light: '#5e3a1e', dark: '#2e1a0c' };
const CREAM = '#fff3d6', GOLD = '#ffd23a';
const TONE = { plain: CREAM, gold: GOLD, pink: '#ffb3c7', gift: '#8fe3ff', dim: '#d6c8b0' };
const RANK = ['#ffd23a', '#dfe5ea', '#e09a5a'];

const SKY_MARGIN = 6; // low-res: pháo nổ cách mép vùng an toàn phía trên
const SECTION_LOG_MS = 5000;

export function createHud(config, { log = (...a) => console.error(...a) } = {}) {
  const ui = config.ui;
  const safe = safeRect(ui);
  const L = {
    board: { x: 24, y: safe.top + 24, w: 600, h: 248 },
    clock: { x: ui.width - 24 - 172, y: safe.top + 24, w: 172, h: 68 },
    feedTop: safe.top + 278,
    popupBottom: safe.top + 624,
    hint: { y: safe.bottom - 68, h: 56 },
  };
  const rotateSec = config.leaderboard?.rotateSec ?? 10;
  const feed = createFeed(ui.feedLines);
  const fishByName = new Map(config.fish.map((f) => [f.name, f.sprite ?? `fish.${f.id}`]));
  const fireworks = createFireworks({
    width: ui.width / SCALE, minY: safe.top / SCALE, skyTop: safe.top / SCALE + SKY_MARGIN,
  });
  const popups = createPopups(config, {
    band: { bottom: L.popupBottom },
    onStart: (p) => { if (p.tier === 'legendary') fireworks.launch('big', lastNow); },
  });
  let lastNow = 0;

  function onEvents(events, now) {
    if (!Array.isArray(events)) return;
    for (const ev of events) {
      if (!ev || typeof ev !== 'object') continue;
      feed.add(ev, now, { nameMax: ui.nameMaxChars });
      if (ev.kind === 'gift' && (ev.fireworks === 'small' || ev.fireworks === 'big')) fireworks.launch(ev.fireworks, now);
    }
    popups.onEvents(events.filter((e) => e && typeof e === 'object'), now);
  }

  // ---- Bảng xếp hạng ----
  function drawRope(ctx, x, top, bottom) {
    for (let y = top; y < bottom; y += 8) {
      ctx.fillStyle = INK; ctx.fillRect(x - 4, y, 8, 8);
      ctx.fillStyle = (y / 8) % 2 ? '#d9b27a' : '#b88a50'; ctx.fillRect(x - 4 + 4 * ((y / 8) % 2), y, 4, 8);
    }
  }

  function boardHeader(ctx, b, icon, title) {
    const { w: iw, h: ih } = iconSize(icon, 4);
    drawIcon(ctx, icon, b.x + 24, b.y + 18 + (36 - ih) / 2, 4);
    drawOutlinedText(ctx, title, b.x + 24 + iw + 14, b.y + 50, {
      font: FONT_PIXEL, size: 46, weight: 400, color: GOLD, outline: INK, width: 8, maxWidth: b.w - iw - 70,
    });
    ctx.fillStyle = '#4a2a14';
    ctx.fillRect(b.x + 16, b.y + 64, b.w - 32, 4);
    ctx.fillStyle = '#c48a48';
    ctx.fillRect(b.x + 16, b.y + 68, b.w - 32, 4);
  }

  function drawSession(ctx, b, rows) {
    boardHeader(ctx, b, 'trophy', 'TOP PHIÊN');
    if (!rows.length) {
      drawOutlinedText(ctx, 'Chưa ai câu được cá', b.x + b.w / 2, b.y + 136, { size: 28, color: CREAM, outline: INK, width: 6, align: 'center', maxWidth: b.w - 48 });
      drawOutlinedText(ctx, 'Gõ "câu" để mở hàng!', b.x + b.w / 2, b.y + 180, { size: 24, weight: 500, color: '#f0d9b0', outline: INK, width: 5, align: 'center', maxWidth: b.w - 48 });
      return;
    }
    rows.slice(0, config.leaderboard?.sessionTop ?? 5).forEach((r, i) => {
      const base = b.y + 106 + i * 30;
      const bx = b.x + 24, by = base - 25;
      ctx.fillStyle = INK; ctx.fillRect(bx, by, 32, 30);
      ctx.fillStyle = RANK[i] ?? '#b07a3e'; ctx.fillRect(bx + 4, by + 4, 24, 22);
      drawOutlinedText(ctx, String(i + 1), bx + 16, base, { font: FONT_PIXEL, size: 32, weight: 400, color: INK, width: 0, align: 'center' });
      drawOutlinedText(ctx, shortName(r?.name, ui.nameMaxChars), b.x + 70, base, { size: 25, color: CREAM, outline: INK, width: 6, maxWidth: 340 });
      drawOutlinedText(ctx, `${formatKg(r?.kg)}kg`, b.x + b.w - 24, base + 2, {
        font: FONT_PIXEL, size: 38, weight: 400, color: i === 0 ? GOLD : '#ffe7a8', outline: INK, width: 7, align: 'right', maxWidth: 160,
      });
    });
  }

  function drawToday(ctx, b, rec, now) {
    boardHeader(ctx, b, 'fish', 'CÁ TO NHẤT HÔM NAY');
    if (!rec) {
      drawOutlinedText(ctx, 'Chưa có kỷ lục hôm nay', b.x + b.w / 2, b.y + 136, { size: 28, color: CREAM, outline: INK, width: 6, align: 'center', maxWidth: b.w - 48 });
      drawOutlinedText(ctx, 'Ai sẽ là người đầu tiên?', b.x + b.w / 2, b.y + 180, { size: 24, weight: 500, color: '#f0d9b0', outline: INK, width: 5, align: 'center', maxWidth: b.w - 48 });
      return;
    }
    const sprite = fishByName.get(rec.fishName);
    const fx = b.x + 108, fy = b.y + 150 + (Math.floor(now / 500) % 2 ? -4 : 0);
    ctx.imageSmoothingEnabled = false;
    drawSprite(ctx, sprite && hasSprite(sprite) ? sprite : 'fish.generic', fx, fy, { scale: 5, maxWidth: 160 });
    const tx = b.x + 200, tw = b.w - 200 - 24;
    drawOutlinedText(ctx, shortName(rec.name, ui.nameMaxChars), tx, b.y + 128, { size: 28, color: CREAM, outline: INK, width: 6, maxWidth: tw });
    drawOutlinedText(ctx, String(rec.fishName ?? ''), tx, b.y + 172, { size: 26, weight: 500, color: '#f0d9b0', outline: INK, width: 6, maxWidth: tw });
    drawOutlinedText(ctx, `${formatKg(rec.kg)}kg`, tx, b.y + 216, { font: FONT_PIXEL, size: 56, weight: 400, color: GOLD, outline: INK, width: 9, maxWidth: tw });
  }

  function drawLeaderboard(ctx, snap, now) {
    const b = L.board;
    drawRope(ctx, b.x + 64, safe.top + 4, b.y + 8);
    drawRope(ctx, b.x + b.w - 64, safe.top + 4, b.y + 8);
    pixelPanel(ctx, b.x, b.y, b.w, b.h, WOOD);
    const lb = snap?.leaderboard ?? {};
    const period = rotateSec * 1000;
    const since = now % period;
    ctx.save();
    if (since < 250) ctx.globalAlpha = since / 250;
    if (leaderboardView(now, rotateSec) === 'session') drawSession(ctx, b, Array.isArray(lb.session) ? lb.session : []);
    else drawToday(ctx, b, lb.today ?? null, now);
    ctx.restore();
  }

  function drawClock(ctx, now) {
    const c = L.clock;
    pixelPanel(ctx, c.x, c.y, c.w, c.h, DARK_WOOD);
    let text = formatClock(new Date(now));
    if (Math.floor(now / 1000) % 2) text = text.replace(':', ' ');
    drawOutlinedText(ctx, text, c.x + c.w / 2, c.y + 50, { font: FONT_PIXEL, size: 58, weight: 400, color: CREAM, outline: INK, width: 0, align: 'center' });
  }

  // ---- Dòng tin ----
  function drawFeed(ctx, now) {
    const n = feed.lines.length;
    feed.lines.forEach((line, i) => {
      const y = L.feedTop + i * 34;
      const age = now - line.at;
      const k = Math.max(0, Math.min(1, age / 220));
      ctx.save();
      ctx.globalAlpha = (0.7 + 0.3 * ((i + 1) / n)) * k;
      const slide = (1 - k) * -40;
      const tw = Math.min(measure(ctx, line.text, { size: 24 }), ui.width - 48 - 32);
      ctx.fillStyle = 'rgba(27,15,8,0.62)';
      ctx.fillRect(24 + slide + 4, y, tw + 24, 32);
      ctx.fillRect(24 + slide, y + 4, tw + 32, 24);
      ctx.fillStyle = TONE[line.tone] ?? CREAM;
      ctx.fillRect(24 + slide, y + 4, 4, 24);
      drawOutlinedText(ctx, line.text, 24 + slide + 16, y + 25, { size: 24, color: TONE[line.tone] ?? CREAM, outline: INK, width: 5, maxWidth: ui.width - 48 - 32 });
      ctx.restore();
    });
  }

  // ---- Hướng dẫn + hàng chờ ----
  function pill(ctx, x, y, w, h, icon, text, color, style) {
    pixelPanel(ctx, x, y, w, h, style);
    const { w: iw, h: ih } = iconSize(icon, 4);
    drawIcon(ctx, icon, x + 20, y + (h - ih) / 2, 4);
    drawOutlinedText(ctx, text, x + 20 + iw + 12, y + h / 2 + 10, { size: 27, color, outline: INK, width: 6, maxWidth: w - iw - 52 });
  }

  function drawHints(ctx, snap, now) {
    const { y, h } = L.hint;
    const hint = hintAt(now, 5);
    const q = queueText(snap?.queueLength ?? 0);
    const pad = 20 + 36 + 12 + 24;
    const hw = Math.ceil(measure(ctx, hint.text, { size: 27 })) + pad;
    const qw = q ? Math.ceil(measure(ctx, q, { size: 27 })) + pad : 0;
    const gap = q ? 16 : 0;
    let x = Math.round((ui.width - (hw + gap + qw)) / 2);
    const since = now % 5000;
    ctx.save();
    if (since < 200) ctx.globalAlpha = since / 200;
    pill(ctx, x, y, hw, h, hint.icon, hint.text, CREAM, { ...WOOD, planks: 0 });
    ctx.restore();
    x += hw + gap;
    if (q) pill(ctx, x, y, qw, h, 'hourglass', q, GOLD, DARK_WOOD);
  }

  // Mỗi phần vẽ riêng: lỗi ở một phần không che các phần khác, ctx luôn được restore,
  // và mỗi phần chỉ ghi log tối đa một lần mỗi 5 giây.
  const lastLogAt = new Map();
  function section(name, ctx, fn) {
    ctx.save();
    try {
      fn();
    } catch (err) {
      const t = lastLogAt.get(name);
      if (t === undefined || lastNow - t >= SECTION_LOG_MS || lastNow < t) {
        lastLogAt.set(name, lastNow);
        log(`Lỗi vẽ HUD (${name}):`, err);
      }
    } finally {
      ctx.restore();
    }
  }

  function draw(ctx, state, now) {
    lastNow = now;
    ctx.imageSmoothingEnabled = false;
    const snap = state.snapshot;
    section('bảng xếp hạng', ctx, () => drawLeaderboard(ctx, snap, now));
    section('đồng hồ', ctx, () => drawClock(ctx, now));
    section('dòng tin', ctx, () => drawFeed(ctx, now));
    section('hướng dẫn', ctx, () => drawHints(ctx, snap, now));
    section('pháo hoa', ctx, () => fireworks.draw(ctx, now, SCALE));
    section('popup', ctx, () => popups.draw(ctx, now));
  }

  return { onEvents, draw, fireworks, popups, feed };
}

// Gắn HUD vào các móc của main.js. Sự kiện được đóng dấu bằng giờ server hiện tại.
export function installHud(hooks, state) {
  const hud = createHud(state.config);
  const nowServer = () => Date.now() + state.offset;
  hooks.onEvents.push((events) => hud.onEvents(events, nowServer()));
  hooks.drawHud.push((ctx, st, now) => hud.draw(ctx, st, now));
  return hud;
}
