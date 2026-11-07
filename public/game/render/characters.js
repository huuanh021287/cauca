// Vẽ người câu trên bến: dáng theo phase (quăng, chờ, cá cắn, kéo, giơ cá), hào quang, biểu tượng
// rồng / mồi trên canvas pixel; avatar tròn, tên, cấp và số mồi trên canvas #hud (high-res).
// Tiến độ phase = (nowServer - phaseStartedAt) / (phaseEndsAt - phaseStartedAt), không cần nhớ trạng thái.

import { seatPosition, colorFromName, hashString, SCALE, SEATS_PER_ROW, CHAR_SCALE, LABEL } from '../layout.js';
import { drawSprite, hasSprite } from '../sprites/registry.js';
import { hairFor } from '../sprites/character.js';
import { rect, curve, grid, withAlpha, safeColor } from '../sprites/pixel.js';
import { createAvatarCache } from './avatars.js';

const K = CHAR_SCALE;
const ROD_LEN = 12 * K;
const LINE_COLOR = 'rgba(255,255,255,0.75)';
const HUD_FONT = '"Be Vietnam Pro", system-ui, sans-serif';
const NAME_MAX_W = 160;   // px high-res
// Biểu tượng rồng / mồi nằm bên trái nhân vật nhưng trong CHAR_BOX (ghế sát mép không bị cắt).
const BADGE_DX = -12;     // tâm biểu tượng so với điểm ngồi (low-res); con giun rộng 8 → [-16, -8]

// "Cả bến reo hò" khi có quà lớn: mọi người đang ngồi nhún nhảy và vẫy tay (tay trái, tay phải cầm cần).
export const CHEER_MS = 2000;
const CHEER_HOP = 3;          // độ nhún tối đa, tính theo pixel thân (×CHAR_SCALE)
const SKIN = '#f6c89a', OUTLINE = '#3a2418';
// Tay giơ cao (lưới pixel thân); hàng cuối nối vào vai áo (cột 1, hàng 11 của thân).
const ARM_UP = ['KK..', 'KSK.', 'KSK.', '.KSK', '.KSK', '.KSK', '.KTK', '.KTK', '..KT'];
const ARM_WAVE = ['.KK.', '.KSK', '.KSK', '.KSK', '.KSK', '.KSK', '.KTK', '.KTK', '..KT'];

// Dáng reo hò của ghế `index` tại `now`; null khi ngoài 2 giây reo hò.
// hop: độ nâng người (low-res, bội số CHAR_SCALE); wave: khung vẫy tay 0/1. Lệch pha theo ghế cho sinh động.
export function cheerPose(startAt, now, index) {
  if (!Number.isFinite(startAt)) return null;
  const e = now - startAt;
  if (e < 0 || e >= CHEER_MS) return null;
  const fade = e < CHEER_MS * 0.8 ? 1 : (CHEER_MS - e) / (CHEER_MS * 0.2);
  const hop = Math.round(CHEER_HOP * Math.abs(Math.sin((Math.PI * e) / 250 + index * 0.9)) * fade) * CHAR_SCALE;
  return { hop, wave: Math.floor((e + index * 90) / 180) % 2 };
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeOut = (v) => 1 - (1 - v) ** 2;

export function phaseProgress(seat, now) {
  const start = seat.phaseStartedAt, end = seat.phaseEndsAt;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return { p: 1, elapsed: Infinity };
  return { p: end > start ? clamp01((now - start) / (end - start)) : 1, elapsed: now - start };
}

export function createCharacters(config) {
  const ui = config.ui;
  const fishSprite = new Map(config.fish.map((f) => [f.id, f.sprite ?? `fish.${f.id}`]));
  const avatars = createAvatarCache({ size: LABEL.avatarR * 2 * SCALE });
  let cheerAt = null;

  function drawCheerArm(ctx, pos, shirt, cp) {
    grid(ctx, cp.wave ? ARM_WAVE : ARM_UP, { K: OUTLINE, S: SKIN, T: safeColor(shirt) },
      pos.x - 8 * K, pos.y - cp.hop - 11 * K, { scale: K });
  }

  // Tính dáng cần, vị trí phao và hiệu ứng cho một nhân vật.
  function pose(seat, pos, now) {
    const hand = { x: pos.x + 3 * K, y: pos.y - 2 * K };
    const target = { x: pos.x + 13 * K, y: pos.y + 28 };
    const tipAt = (deg) => {
      const r = (deg * Math.PI) / 180;
      return { x: Math.round(hand.x + ROD_LEN * Math.cos(r)), y: Math.round(hand.y - ROD_LEN * Math.sin(r)) };
    };
    const { p, elapsed } = phaseProgress(seat, now);
    const out = { hand, tip: tipAt(72), bend: 0, bobber: null, sunk: false, splash: -1, exclaim: false, fish: null, bob: 0 };
    const hang = (tip) => ({ x: tip.x, y: tip.y + 5 });
    switch (seat.phase) {
      case 'casting': {
        const deg = p < 0.4 ? 72 + (125 - 72) * easeOut(p / 0.4) : 125 - (125 - 30) * easeOut((p - 0.4) / 0.6);
        out.tip = tipAt(deg);
        if (p < 0.6) out.bobber = hang(out.tip);
        else {
          const q = (p - 0.6) / 0.4;
          out.bobber = {
            x: out.tip.x + (target.x - out.tip.x) * q,
            y: out.tip.y + (target.y - out.tip.y) * q - Math.sin(q * Math.PI) * 14,
          };
        }
        break;
      }
      case 'waiting':
        out.tip = tipAt(30);
        out.bobber = { x: target.x, y: target.y + (Math.sin(now / 520 + pos.x) > 0.3 ? 1 : 0) };
        if (elapsed < 600) out.splash = elapsed / 600;
        break;
      case 'bite':
        out.tip = tipAt(28 + (Math.floor(now / 120) % 2 ? -4 : 2));
        out.bend = Math.floor(now / 150) % 2 ? 4 : 1;
        out.bobber = { x: target.x, y: target.y + 1 };
        out.sunk = Math.floor(now / 220) % 3 !== 0;
        out.splash = (now % 700) / 700;
        out.exclaim = true;
        break;
      case 'reeling':
        out.tip = tipAt(48);
        out.bend = 8 + Math.round(Math.sin(now / 90) * 2);
        out.bobber = { x: target.x - 3 * p, y: target.y - 18 * easeOut(p) };
        out.splash = (now % 400) / 400;
        break;
      case 'result':
        out.tip = tipAt(84);
        out.bobber = hang(out.tip);
        out.bob = Math.floor(now / 260) % 2 ? -1 : 0;
        if (seat.lastCatch) out.fish = { x: pos.x + 17, y: pos.y - 28 + out.bob * K, catch: seat.lastCatch };
        break;
      default: // idle
        out.tip = tipAt(72 + Math.sin(now / 900 + pos.x) * 3);
        out.bobber = hang(out.tip);
    }
    return out;
  }

  function drawAura(ctx, pos, color, now) {
    const pulse = 0.16 + 0.08 * Math.sin(now / 300);
    ctx.fillStyle = withAlpha(color, pulse);
    for (const [w, h] of [[36, 40], [28, 50]]) ctx.fillRect(pos.x - w / 2, pos.y - 12 - h / 2, w, h);
    for (let i = 0; i < 5; i++) {
      const rise = (now / 40 + i * 9) % 40;
      const sx = pos.x - 15 + ((i * 7) % 31);
      ctx.fillStyle = withAlpha(color, 1 - rise / 40);
      ctx.fillRect(Math.round(sx), Math.round(pos.y + 4 - rise), 1, 1);
    }
  }

  function drawStool(ctx, pos) {
    ctx.globalAlpha = 0.45;
    rect(ctx, pos.x - 6, pos.y - 6, 13, 3, '#8a5a32');
    rect(ctx, pos.x - 5, pos.y - 3, 2, 3, '#5a3a20');
    rect(ctx, pos.x + 4, pos.y - 3, 2, 3, '#5a3a20');
    ctx.globalAlpha = 1;
  }

  function drawFishHeld(ctx, fish, now) {
    const id = fishSprite.get(fish.catch.fishId);
    const sprite = id && hasSprite(id) ? id : 'fish.generic';
    const tier = fish.catch.tier;
    if (tier === 'epic' || tier === 'legendary') {
      const c = tier === 'legendary' ? '#ffd23a' : '#c77dff';
      for (let i = 0; i < 6; i++) {
        const a = now / 300 + (i * Math.PI) / 3;
        if ((Math.floor(now / 150) + i) % 2) continue;
        rect(ctx, fish.x + Math.cos(a) * 16, fish.y + Math.sin(a) * 11, 1, 1, c);
      }
    }
    // Cá nhỏ phóng ×2 như nhân vật; cá to giữ ×1 để không lấn sang ghế bên cạnh.
    drawSprite(ctx, sprite, fish.x, fish.y, { scale: K, maxWidth: 34 });
  }

  // Một hàng nhân vật trên canvas pixel (gọi sau khi vẽ bến của hàng đó).
  function drawRow(ctx, seats, row, now) {
    const held = [];
    for (let i = row * SEATS_PER_ROW; i < Math.min(seats.length, (row + 1) * SEATS_PER_ROW); i++) {
      const seat = seats[i];
      const pos = seatPosition(i, ui);
      if (!seat) { drawStool(ctx, pos); continue; }
      const h = hashString(seat.name ?? seat.userId);
      const pz = pose(seat, pos, now);
      const cp = cheerPose(cheerAt, now, i);
      if (cp) {
        // Cả người (và tay cầm cần) nhún lên; phao vẫn nằm dưới nước.
        pz.hand.y -= cp.hop; pz.tip.y -= cp.hop;
        if (pz.fish) pz.fish.y -= cp.hop;
      }
      if (seat.aura) drawAura(ctx, pos, seat.rodColor, now);
      const blink = (now + (h % 4000)) % 4200 < 140;
      const shirt = colorFromName(seat.name ?? seat.userId);
      drawSprite(ctx, 'char.body', pos.x, pos.y - (cp?.hop ?? 0), {
        shirt, hair: hairFor(h), hat: (h >>> 3) % 5 < 2,
        blink: blink && !cp, bob: pz.bob, scale: K,
      });
      if (cp) drawCheerArm(ctx, pos, shirt, cp);
      drawSprite(ctx, 'char.rod', pos.x, pos.y, { hand: pz.hand, tip: pz.tip, bend: pz.bend, color: seat.rodColor, thick: 2 });
      if (pz.bobber) {
        const b = pz.bobber;
        curve(ctx, pz.tip.x, pz.tip.y, (pz.tip.x + b.x) / 2, Math.max(pz.tip.y, b.y) + 2, b.x, b.y - 2, LINE_COLOR, 8);
        drawSprite(ctx, 'fx.bobber', b.x, b.y, { sunk: pz.sunk });
        if (pz.splash >= 0) drawSprite(ctx, 'fx.splash', b.x, b.y, { t: pz.splash });
      }
      if (pz.fish) held.push(pz.fish);
      if (pz.exclaim) {
        const jump = Math.floor(now / 160) % 2;
        drawSprite(ctx, 'fx.exclaim', pz.bobber.x + 7, pz.bobber.y - 4 - jump, { on: jump === 0, scale: 2 });
      }
      if (seat.legendary) drawSprite(ctx, 'fx.legendary', pos.x + BADGE_DX + 1, pos.y - 24, { glint: Math.floor(now / 400) % 2 === 0 });
      if (seat.bait > 0) drawSprite(ctx, 'fx.bait', pos.x + BADGE_DX, pos.y - 6);
    }
    // Cá giơ lên vẽ sau cùng để nằm trên cả nhân vật bên cạnh (chỉ trong 3 giây kết quả)
    for (const fish of held) drawFishHeld(ctx, fish, now);
  }

  function shortName(name) {
    const chars = Array.from(String(name ?? ''));
    return chars.length > ui.nameMaxChars ? `${chars.slice(0, ui.nameMaxChars - 1).join('')}…` : chars.join('');
  }

  function outlinedText(ctx, text, x, y, size, fill, maxWidth) {
    ctx.font = `700 ${size}px ${HUD_FONT}`;
    ctx.lineWidth = Math.max(4, size / 4);
    ctx.strokeStyle = '#000000';
    ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y, maxWidth);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y, maxWidth);
  }

  function drawLabel(hud, seat, i) {
    const pos = seatPosition(i, ui);
    const img = avatars.get(seat.avatar);
    const r = LABEL.avatarR * SCALE;
    const ax = pos.x * SCALE, avY = (pos.y - LABEL.avatarY) * SCALE;
    if (img) {
      hud.beginPath();
      hud.arc(ax, avY, r + 3, 0, Math.PI * 2);
      hud.fillStyle = safeColor(seat.rodColor);
      hud.fill();
      hud.drawImage(img, ax - r, avY - r, r * 2, r * 2);
    }
    // Tên và huy hiệu giữ trong khung 1080 (ghế sát mép không bị cắt chữ)
    const cx = Math.max(NAME_MAX_W / 2 + 4, Math.min(ui.width - NAME_MAX_W / 2 - 4, ax));
    const nameY = img ? avY - r - 8 : (pos.y - LABEL.nameNoAvatarY) * SCALE;
    outlinedText(hud, shortName(seat.name), cx, nameY, 22, '#ffffff', NAME_MAX_W);
    const lv = `Lv.${seat.level}`;
    hud.font = `700 17px ${HUD_FONT}`;
    const bw = hud.measureText(lv).width + 12, by = nameY - 46;
    hud.fillStyle = '#000000';
    hud.fillRect(cx - bw / 2 - 2, by - 2, bw + 4, 24);
    hud.fillStyle = safeColor(seat.rodColor);
    hud.fillRect(cx - bw / 2, by, bw, 20);
    outlinedText(hud, lv, cx, by + 16, 17, '#fff6c8');
    if (seat.bait > 0) {
      // Số mồi canh trái, bắt đầu ngay sau con giun
      hud.textAlign = 'left';
      outlinedText(hud, `${seat.bait}`, (pos.x + BADGE_DX + 5) * SCALE, (pos.y + 6) * SCALE, 20, '#ffd0dc', 15 * SCALE);
      hud.textAlign = 'center';
    }
  }

  // Avatar, tên, cấp, số mồi (canvas #hud, tọa độ high-res).
  function drawHud(hud, seats, now) {
    avatars.sweep(seats.filter(Boolean).map((s) => s.avatar), now);
    hud.save();
    try {
      hud.textAlign = 'center';
      hud.textBaseline = 'alphabetic';
      seats.forEach((seat, i) => { if (seat) drawLabel(hud, seat, i); });
    } finally {
      hud.restore();
    }
  }

  // Quà lớn (≥100 xu): cả bến reo hò trong CHEER_MS.
  function cheer(now) { cheerAt = now; }

  return { drawRow, drawHud, cheer };
}
