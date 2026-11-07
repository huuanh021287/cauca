// Nhân vật, cần câu, phao và cá vẽ bằng SVG trên lớp #actors (nằm giữa canvas nền pixel và canvas HUD).
// Tọa độ SVG trùng hệ 270×480 của canvas pixel nên dùng lại seatPosition/poseFor nguyên si.
// Hoạt hình: CSS (nhịp thở, chớp mắt, nảy, đung đưa) chạy mượt trên GPU; JS chỉ cập nhật vị trí mỗi khung.
// Mỗi lớp chuyển động nằm trong nhóm riêng vì một phần tử không thể vừa có transform (vị trí) vừa có animation.

import { seatPosition, colorFromName, hashString } from '../layout.js';
import { hairFor } from '../sprites/character.js';
import { poseFor, cheerPose } from './characters.js';

const NS = 'http://www.w3.org/2000/svg';
const SKIN = '#ffd9b0', INK = '#3a2418', CHEEK = '#ff8fa3', HAT = '#e9c873', HAT_DARK = '#6b4a1e';
const TIER_COLOR = { trash: '#b7c4cc', common: '#7fc8f8', rare: '#6fe0b8', epic: '#c79bff', legendary: '#ffd23a' };

// Trạng thái hình học của một ghế ở một thời điểm: thuần, không đụng DOM (test được trong Node).
// cheer = { hop, wave } từ cheerPose, hoặc null.
export function buildSeatState(seat, pos, now, cheer = null) {
  const pz = poseFor(seat, pos, now);
  const hop = cheer ? cheer.hop : 0;
  return {
    hop,
    wave: cheer ? cheer.wave : 0,
    hand: { x: pz.hand.x, y: pz.hand.y - hop },
    tip: { x: pz.tip.x, y: pz.tip.y - hop },
    bend: pz.bend,
    bobber: pz.bobber,
    sunk: pz.sunk,
    splash: pz.splash,
    exclaim: pz.exclaim,
    meter: pz.meter ?? null,
    fish: pz.fish ? { x: pz.fish.x, y: pz.fish.y - hop, catch: pz.fish.catch } : null,
    miss: seat.phase === 'result' && !seat.lastCatch,
  };
}

// Đường cong cần câu / dây câu: điểm điều khiển nằm giữa, võng xuống (giống bản pixel).
export function rodPath(hand, tip, bend = 0) {
  const mx = (hand.x + tip.x) / 2, my = (hand.y + tip.y) / 2;
  return `M${hand.x} ${hand.y} Q${(mx - bend * 0.4).toFixed(2)} ${(my - bend).toFixed(2)} ${tip.x} ${tip.y}`;
}

export function linePath(tip, b) {
  const cx = (tip.x + b.x) / 2, cy = Math.max(tip.y, b.y) + 2;
  return `M${tip.x} ${tip.y} Q${cx.toFixed(2)} ${cy.toFixed(2)} ${b.x} ${b.y - 2}`;
}

function el(tag, attrs = {}, parent = null) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (parent) parent.appendChild(node);
  return node;
}

// Bộ phận cố định của một ghế (dựng một lần).
function buildSeat(svg, pos, seat) {
  const x = pos.x, y = pos.y;
  const h = hashString(seat?.name ?? seat?.userId ?? '');
  const shirt = colorFromName(seat?.name ?? seat?.userId ?? '');
  const g = el('g', { class: 'seat' }, svg);

  // Hiệu ứng nền: hào quang (huyền thoại, cấp cao) đặt sau người
  const aura = el('ellipse', { class: 'aura', cx: x, cy: y - 20, rx: 15, ry: 19, fill: 'none', 'stroke-width': 1.2, opacity: 0 }, g);

  // Thân người: nhóm hop (vị trí, JS) → nhóm breathe (nhịp thở, CSS)
  const hop = el('g', {}, g);
  const body = el('g', { class: 'breathe' }, hop);
  el('ellipse', { cx: x, cy: y - 1, rx: 9, ry: 2.6, fill: '#8a5a32', opacity: 0.85 }, body);
  el('rect', { x: x - 6.5, y: y - 20, width: 13, height: 14, rx: 5, fill: shirt, stroke: INK, 'stroke-width': 0.5 }, body);
  el('circle', { cx: x - 7.5, cy: y - 14, r: 2.2, fill: SKIN, stroke: INK, 'stroke-width': 0.4 }, body);
  const head = el('g', {}, body);
  el('circle', { cx: x, cy: y - 27, r: 8.5, fill: SKIN, stroke: INK, 'stroke-width': 0.6 }, head);
  el('path', {
    d: `M${x - 8.5} ${y - 27} A8.5 8.5 0 0 1 ${x + 8.5} ${y - 27} Q${x + 5} ${y - 30.5} ${x} ${y - 30} Q${x - 5} ${y - 30.5} ${x - 8.5} ${y - 27} Z`,
    fill: hairFor(h), stroke: INK, 'stroke-width': 0.4,
  }, head);
  const eyes = el('g', { class: 'blink' }, head);
  for (const dx of [-3, 3]) {
    el('circle', { cx: x + dx, cy: y - 26, r: 1.3, fill: INK }, eyes);
    el('circle', { cx: x + dx + 0.4, cy: y - 26.4, r: 0.45, fill: '#ffffff' }, eyes);
  }
  el('ellipse', { cx: x - 5, cy: y - 23, rx: 1.6, ry: 1, fill: CHEEK, opacity: 0.6 }, head);
  el('ellipse', { cx: x + 5, cy: y - 23, rx: 1.6, ry: 1, fill: CHEEK, opacity: 0.6 }, head);
  el('path', { d: `M${x - 1.2} ${y - 22.5} Q${x} ${y - 21.6} ${x + 1.2} ${y - 22.5}`, fill: 'none', stroke: INK, 'stroke-width': 0.5, 'stroke-linecap': 'round' }, head);
  if ((h >>> 3) % 5 < 2) {
    el('path', { d: `M${x - 12.5} ${y - 30} Q${x} ${y - 27} ${x + 12.5} ${y - 30} Q${x} ${y - 40} ${x - 12.5} ${y - 30} Z`, fill: HAT, stroke: HAT_DARK, 'stroke-width': 0.5, 'stroke-linejoin': 'round' }, head);
  }
  const armUp = el('circle', { cx: x + 7.5, cy: y - 30, r: 2.2, fill: SKIN, stroke: INK, 'stroke-width': 0.4, opacity: 0 }, g);

  // Cần, dây, phao, tia nước, cá cắn, thanh canh nhịp, cá thoát
  const rod = el('path', { fill: 'none', 'stroke-linecap': 'round', 'stroke-width': 1.5 }, g);
  const hand = el('circle', { r: 2.3, fill: SKIN, stroke: INK, 'stroke-width': 0.4 }, g);
  const line = el('path', { fill: 'none', stroke: 'rgba(255,255,255,0.85)', 'stroke-width': 0.35 }, g);
  const bobber = el('g', {}, g);
  const bobberIn = el('g', { class: 'bob-float' }, bobber);
  const bobTop = el('circle', { cx: 0, cy: -1.5, r: 1.6, fill: '#e8402e', stroke: INK, 'stroke-width': 0.3 }, bobberIn);
  el('circle', { cx: 0, cy: 0.5, r: 1.4, fill: '#ffffff', stroke: INK, 'stroke-width': 0.3 }, bobberIn);
  const splash = el('circle', { fill: 'none', stroke: '#ffffff', 'stroke-width': 0.4 }, g);
  const meter = el('g', {}, g);
  el('rect', { x: -1, y: -1, width: 26, height: 5, rx: 2, fill: '#000000', opacity: 0.6 }, meter);
  el('rect', { x: 0, y: 0, width: 24, height: 3, rx: 1, fill: '#2a3a4a' }, meter);
  const sweet = el('rect', { y: 0, height: 3, rx: 1, fill: '#7cfc7c' }, meter);
  const marker = el('rect', { y: -1, width: 1, height: 5, fill: '#ffffff' }, meter);
  const exclaim = el('g', {}, g);
  const exclaimIn = el('g', { class: 'exclaim' }, exclaim);
  el('circle', { cx: 0, cy: 0, r: 3.4, fill: '#ffe14a', stroke: INK, 'stroke-width': 0.6 }, exclaimIn);
  el('text', { x: 0, y: 1.6, 'text-anchor': 'middle', 'font-size': 5, 'font-weight': 800, fill: INK, 'font-family': 'system-ui, sans-serif' }, exclaimIn).textContent = '!';
  const fish = el('g', {}, g);
  const fishIn = el('g', { class: 'fish' }, fish);
  const fishBody = el('ellipse', { rx: 6, ry: 3.4, stroke: INK, 'stroke-width': 0.5 }, fishIn);
  const fishTail = el('path', { stroke: INK, 'stroke-width': 0.4, 'stroke-linejoin': 'round' }, fishIn);
  el('circle', { cx: 3, cy: -0.8, r: 0.8, fill: INK }, fishIn);
  const trashBox = el('rect', { x: -4, y: -3, width: 8, height: 6, rx: 1.5, stroke: INK, 'stroke-width': 0.5 }, fishIn);
  // Cá thoát: dấu hỏi và giọt mồ hôi đặt trên đầu người câu (toạ độ cục bộ quanh điểm đầu)
  const miss = el('g', { transform: `translate(${x + 12} ${y - 60})` }, g);
  const missIn = el('g', { class: 'miss' }, miss);
  el('text', { x: 0, y: 3, 'text-anchor': 'middle', 'font-size': 9, 'font-weight': 800, fill: '#ffe14a', stroke: INK, 'stroke-width': 0.6, 'paint-order': 'stroke', 'font-family': 'system-ui, sans-serif' }, missIn).textContent = '?';
  el('path', { d: 'M0 -3 Q1.5 -1 1.5 0 A1.5 1.5 0 0 1 -1.5 0 Q-1.5 -1 0 -3 Z', fill: '#7fd3ff', stroke: INK, 'stroke-width': 0.3 }, missIn).setAttribute('transform', 'translate(-28 26)');

  // Huy hiệu mồi
  const bait = el('g', {}, g);
  el('circle', { cx: x - 12, cy: y - 6, r: 3, fill: '#f08aa0', stroke: '#7a2a3a', 'stroke-width': 0.4 }, bait);
  const baitCount = el('text', { x: x - 8.5, y: y - 3.5, 'font-size': 4, 'font-weight': 800, fill: '#ffd0dc', stroke: INK, 'stroke-width': 0.6, 'paint-order': 'stroke', 'font-family': 'system-ui, sans-serif' }, bait);

  return {
    g, aura, hop, body, head, eyes, armUp, hand, rod, line, bobber, bobTop, splash,
    meter, sweet, marker, exclaim, fish, fishIn, fishBody, fishTail, trashBox, miss, bait, baitCount,
    shirt, pos,
  };
}

function setFish(d, fishState) {
  if (!fishState) { d.fish.style.display = 'none'; return; }
  d.fish.style.display = '';
  const { x, y, catch: c } = fishState;
  d.fish.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
  const color = TIER_COLOR[c.tier] ?? TIER_COLOR.common;
  const isTrash = c.tier === 'trash' || !c.kg;
  d.trashBox.style.display = isTrash ? '' : 'none';
  d.fishBody.style.display = isTrash ? 'none' : '';
  d.fishTail.style.display = isTrash ? 'none' : '';
  if (isTrash) {
    d.trashBox.setAttribute('fill', color);
  } else {
    d.fishBody.setAttribute('fill', color);
    d.fishBody.setAttribute('cx', -2);
    d.fishBody.setAttribute('cy', 0);
    d.fishTail.setAttribute('d', 'M-6 0 L-10.5 -3.6 Q-9.2 0 -10.5 3.6 Z');
    d.fishTail.setAttribute('fill', color);
  }
}

function setSeat(d, seat, now, cheer) {
  const st = buildSeatState(seat, d.pos, now, cheer);
  d.g.style.display = '';
  d.hop.setAttribute('transform', `translate(0 ${-st.hop})`);
  d.armUp.setAttribute('opacity', cheer ? 1 : 0);
  if (cheer) d.armUp.setAttribute('cy', (d.pos.y - 30 - (cheer.wave ? 2 : 0)).toFixed(2));

  d.rod.setAttribute('d', rodPath(st.hand, st.tip, st.bend));
  d.rod.setAttribute('stroke', seat.rodColor ?? '#8b5a2b');
  d.hand.setAttribute('cx', st.hand.x.toFixed(2));
  d.hand.setAttribute('cy', st.hand.y.toFixed(2));

  if (st.bobber) {
    const b = st.bobber;
    d.line.setAttribute('d', linePath(st.tip, b));
    d.line.style.display = '';
    d.bobber.setAttribute('transform', `translate(${b.x.toFixed(2)} ${b.y.toFixed(2)})`);
    d.bobber.style.display = '';
    d.bobTop.style.opacity = st.sunk ? 0 : 1;
    if (st.splash >= 0) {
      d.splash.setAttribute('cx', b.x); d.splash.setAttribute('cy', b.y + 0.5);
      d.splash.setAttribute('r', (1 + st.splash * 4).toFixed(2));
      d.splash.setAttribute('opacity', (1 - st.splash).toFixed(2));
      d.splash.style.display = '';
    } else d.splash.style.display = 'none';
    d.exclaim.style.display = st.exclaim ? '' : 'none';
    if (st.exclaim) d.exclaim.setAttribute('transform', `translate(${b.x + 7} ${b.y - 4})`);
  } else {
    d.line.style.display = 'none';
    d.bobber.style.display = 'none';
    d.splash.style.display = 'none';
    d.exclaim.style.display = 'none';
  }

  if (st.meter) {
    const W = 24, b = st.bobber;
    const x0 = Math.round(b.x - W / 2), y = Math.round(b.y + 9);
    d.meter.style.display = '';
    d.meter.setAttribute('transform', `translate(${x0} ${y})`);
    const from = st.meter.from * W, to = Math.max(from + 1, st.meter.to * W);
    d.sweet.setAttribute('x', from.toFixed(2));
    d.sweet.setAttribute('width', (to - from).toFixed(2));
    d.marker.setAttribute('x', (Math.max(0, Math.min(1, st.meter.p)) * W).toFixed(2));
  } else d.meter.style.display = 'none';

  setFish(d, st.fish);
  d.miss.style.display = st.miss ? '' : 'none';
  const legendary = seat.legendary;
  d.aura.setAttribute('stroke', seat.rodColor ?? '#ffffff');
  d.aura.setAttribute('opacity', seat.aura || legendary ? 0.7 : 0);
  d.aura.setAttribute('class', legendary ? 'aura legendary' : 'aura');
  d.bait.style.display = seat.bait > 0 ? '' : 'none';
  d.baitCount.textContent = seat.bait > 0 ? String(seat.bait) : '';
}

export function createActors(svg, config) {
  const ui = config.ui;
  const dom = [];
  let cheerAt = null;

  // Ghế đổi người ngồi thì dựng lại (màu áo, tóc và nón theo người mới).
  function ensure(i, seat) {
    if (dom[i] && dom[i].userId !== seat.userId) { dom[i].g.remove(); dom[i] = null; }
    if (!dom[i]) {
      dom[i] = buildSeat(svg, seatPosition(i, ui), seat);
      dom[i].userId = seat.userId;
    }
    return dom[i];
  }

  // Gọi mỗi khung hình (rAF): seats là snapshot của server, now là giờ server.
  function update(seats, now) {
    for (let i = 0; i < seats.length; i++) {
      const seat = seats[i];
      if (!seat) { if (dom[i]) dom[i].g.style.display = 'none'; continue; }
      const d = ensure(i, seat);
      setSeat(d, seat, now, cheerPose(cheerAt, now, i));
    }
  }

  // Quà lớn: cả bến reo hò trong CHEER_MS (giống bản canvas).
  function cheer(now) { cheerAt = now; }

  return { update, cheer };
}
