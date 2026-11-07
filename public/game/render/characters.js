// Vẽ người câu trên bến: dáng theo phase (quăng, chờ, cá cắn, kéo, giơ cá), hào quang, biểu tượng
// rồng / mồi trên canvas pixel; avatar tròn, tên, cấp và số mồi trên canvas #hud (high-res).
// Tiến độ phase tính từ lúc thấy phase đổi tới `phaseEndsAt` (giờ server), nên không cần biết
// thời lượng từng phase.

import { seatPosition, colorFromName, hashString, SCALE, SEATS_PER_ROW } from '../layout.js';
import { drawSprite, hasSprite } from '../sprites/registry.js';
import { hairFor } from '../sprites/character.js';
import { rect, curve, withAlpha } from '../sprites/pixel.js';

const ROD_LEN = 20;
const LINE_COLOR = 'rgba(255,255,255,0.75)';
const HUD_FONT = '"Be Vietnam Pro", system-ui, sans-serif';

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeOut = (v) => 1 - (1 - v) ** 2;

export function createCharacters(config) {
  const ui = config.ui;
  const fishSprite = new Map(config.fish.map((f) => [f.id, f.sprite ?? `fish.${f.id}`]));
  const phases = new Map();   // userId -> {phase, start}
  const avatars = new Map();  // url -> {img, state}

  function track(seats, now) {
    const seen = new Set();
    for (const s of seats) {
      if (!s) continue;
      seen.add(s.userId);
      const cur = phases.get(s.userId);
      if (!cur || cur.phase !== s.phase || cur.endsAt !== s.phaseEndsAt) {
        phases.set(s.userId, { phase: s.phase, start: cur?.phase === s.phase ? cur.start : now, endsAt: s.phaseEndsAt });
      }
    }
    for (const id of phases.keys()) if (!seen.has(id)) phases.delete(id);
  }

  function progress(seat, now) {
    const p = phases.get(seat.userId);
    if (!p || !seat.phaseEndsAt) return { p: 1, elapsed: Infinity };
    const total = seat.phaseEndsAt - p.start;
    return { p: total > 0 ? clamp01((now - p.start) / total) : 1, elapsed: now - p.start };
  }

  // Tính dáng cần, vị trí phao và hiệu ứng cho một nhân vật.
  function pose(seat, pos, now) {
    const hand = { x: pos.x + 3, y: pos.y - 2 };
    const target = { x: pos.x + 13, y: pos.y + 24 };
    const tipAt = (deg) => {
      const r = (deg * Math.PI) / 180;
      return { x: Math.round(hand.x + ROD_LEN * Math.cos(r)), y: Math.round(hand.y - ROD_LEN * Math.sin(r)) };
    };
    const { p, elapsed } = progress(seat, now);
    const out = { hand, tip: tipAt(72), bend: 0, bobber: null, sunk: false, splash: -1, exclaim: false, fish: null, bob: 0 };
    const hang = (tip) => ({ x: tip.x, y: tip.y + 5 });
    switch (seat.phase) {
      case 'casting': {
        const deg = p < 0.4 ? 72 + (125 - 72) * easeOut(p / 0.4) : 125 - (125 - 35) * easeOut((p - 0.4) / 0.6);
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
        out.tip = tipAt(35);
        out.bobber = { x: target.x, y: target.y + (Math.sin(now / 520 + pos.x) > 0.3 ? 1 : 0) };
        if (elapsed < 600) out.splash = elapsed / 600;
        break;
      case 'bite':
        out.tip = tipAt(30 + (Math.floor(now / 120) % 2 ? -4 : 2));
        out.bend = Math.floor(now / 150) % 2 ? 3 : 1;
        out.bobber = { x: target.x, y: target.y + 1 };
        out.sunk = Math.floor(now / 220) % 3 !== 0;
        out.splash = (now % 700) / 700;
        out.exclaim = true;
        break;
      case 'reeling':
        out.tip = tipAt(48);
        out.bend = 6 + Math.round(Math.sin(now / 90) * 1.5);
        out.bobber = { x: target.x - 3 * p, y: target.y - 14 * easeOut(p) };
        out.splash = (now % 400) / 400;
        break;
      case 'result':
        out.tip = tipAt(84);
        out.bobber = hang(out.tip);
        out.bob = Math.floor(now / 260) % 2 ? -1 : 0;
        if (seat.lastCatch) out.fish = { x: pos.x + 13, y: pos.y - 13 + out.bob, catch: seat.lastCatch };
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
    for (const [w, h] of [[22, 22], [16, 28]]) ctx.fillRect(pos.x - w / 2, pos.y - 20 - (h - 22) / 2, w, h);
    for (let i = 0; i < 4; i++) {
      const rise = (now / 45 + i * 9) % 26;
      const sx = pos.x - 9 + ((i * 7) % 19);
      ctx.fillStyle = withAlpha(color, 1 - rise / 26);
      ctx.fillRect(Math.round(sx), Math.round(pos.y - rise), 1, 1);
    }
  }

  function drawStool(ctx, pos) {
    ctx.globalAlpha = 0.45;
    rect(ctx, pos.x - 4, pos.y - 4, 9, 2, '#8a5a32');
    rect(ctx, pos.x - 3, pos.y - 2, 1, 2, '#5a3a20');
    rect(ctx, pos.x + 3, pos.y - 2, 1, 2, '#5a3a20');
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
        rect(ctx, fish.x + Math.cos(a) * 13, fish.y + Math.sin(a) * 8, 1, 1, c);
      }
    }
    drawSprite(ctx, sprite, fish.x, fish.y);
  }

  // Một hàng nhân vật trên canvas pixel (gọi sau khi vẽ bến của hàng đó).
  function drawRow(ctx, seats, row, now) {
    track(seats, now);
    for (let i = row * SEATS_PER_ROW; i < Math.min(seats.length, (row + 1) * SEATS_PER_ROW); i++) {
      const seat = seats[i];
      const pos = seatPosition(i, ui);
      if (!seat) { drawStool(ctx, pos); continue; }
      const h = hashString(seat.name ?? seat.userId);
      const pz = pose(seat, pos, now);
      if (seat.aura) drawAura(ctx, pos, seat.rodColor ?? '#ffd700', now);
      const blink = (now + (h % 4000)) % 4200 < 140;
      drawSprite(ctx, 'char.body', pos.x, pos.y, {
        shirt: colorFromName(seat.name ?? seat.userId), hair: hairFor(h), hat: (h >>> 3) % 5 < 2, blink, bob: pz.bob,
      });
      drawSprite(ctx, 'char.rod', pos.x, pos.y, { hand: pz.hand, tip: pz.tip, bend: pz.bend, color: seat.rodColor });
      if (pz.bobber) {
        const b = pz.bobber;
        curve(ctx, pz.tip.x, pz.tip.y, (pz.tip.x + b.x) / 2, Math.max(pz.tip.y, b.y) + 2, b.x, b.y - 2, LINE_COLOR, 8);
        drawSprite(ctx, 'fx.bobber', b.x, b.y, { sunk: pz.sunk });
        if (pz.splash >= 0) drawSprite(ctx, 'fx.splash', b.x, b.y, { t: pz.splash });
      }
      if (pz.fish) drawFishHeld(ctx, pz.fish, now);
      if (pz.exclaim) {
        const jump = Math.floor(now / 160) % 2;
        drawSprite(ctx, 'fx.exclaim', pz.bobber.x + 5, pz.bobber.y - 2 - jump, { on: jump === 0 });
      }
      if (seat.legendary) drawSprite(ctx, 'fx.legendary', pos.x - 11, pos.y - 17, { glint: Math.floor(now / 400) % 2 === 0 });
      if (seat.bait > 0) drawSprite(ctx, 'fx.bait', pos.x - 12, pos.y - 4);
    }
  }

  function avatarFor(url) {
    if (!url) return null;
    let a = avatars.get(url);
    if (!a) {
      a = { img: new Image(), state: 'loading' };
      a.img.onload = () => { a.state = 'ok'; };
      a.img.onerror = () => { a.state = 'failed'; };
      a.img.src = url;
      avatars.set(url, a);
    }
    return a.state === 'ok' ? a.img : null;
  }

  function shortName(name) {
    const chars = Array.from(String(name ?? ''));
    return chars.length > ui.nameMaxChars ? `${chars.slice(0, ui.nameMaxChars - 1).join('')}…` : chars.join('');
  }

  function outlinedText(ctx, text, x, y, size, fill) {
    ctx.font = `700 ${size}px ${HUD_FONT}`;
    ctx.lineWidth = Math.max(4, size / 4);
    ctx.strokeStyle = '#000000';
    ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
  }

  // Avatar, tên, cấp, số mồi (canvas #hud, tọa độ high-res).
  function drawHud(hud, seats, now) {
    hud.save();
    hud.textAlign = 'center';
    hud.textBaseline = 'alphabetic';
    seats.forEach((seat, i) => {
      if (!seat) return;
      const pos = seatPosition(i, ui);
      const cx = pos.x * SCALE;
      const img = avatarFor(seat.avatar);
      const avY = (pos.y - 25) * SCALE, r = 24;
      if (img) {
        hud.save();
        hud.beginPath();
        hud.arc(cx, avY, r + 3, 0, Math.PI * 2);
        hud.fillStyle = seat.rodColor ?? '#ffffff';
        hud.fill();
        hud.beginPath();
        hud.arc(cx, avY, r, 0, Math.PI * 2);
        hud.clip();
        hud.drawImage(img, cx - r, avY - r, r * 2, r * 2);
        hud.restore();
      }
      // Từ trên xuống: huy hiệu cấp, tên, avatar, đầu nhân vật
      const nameY = img ? avY - r - 8 : (pos.y - 21) * SCALE;
      outlinedText(hud, shortName(seat.name), cx, nameY, 22, '#ffffff');
      const lv = `Lv.${seat.level}`;
      hud.font = `800 17px ${HUD_FONT}`;
      const bw = hud.measureText(lv).width + 12, by = nameY - 46;
      hud.fillStyle = '#000000';
      hud.fillRect(cx - bw / 2 - 2, by - 2, bw + 4, 24);
      hud.fillStyle = seat.rodColor ?? '#8b5a2b';
      hud.fillRect(cx - bw / 2, by, bw, 20);
      outlinedText(hud, lv, cx, by + 16, 17, '#fff6c8');
      if (seat.bait > 0) {
        hud.textAlign = 'left';
        outlinedText(hud, `${seat.bait}`, (pos.x - 8) * SCALE, (pos.y + 1) * SCALE, 20, '#ffd0dc');
        hud.textAlign = 'center';
      }
    });
    hud.restore();
  }

  return { drawRow, drawHud };
}
