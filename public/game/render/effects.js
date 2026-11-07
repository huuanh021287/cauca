// Hiệu ứng Lottie (chỉ là hình ảnh): gợn nước khi thả cần, bắn tóe khi cá cắn, vụn ăn mừng theo bậc cá,
// tia sáng và mưa vụn khi trúng cá huyền thoại, tim bay khi có quà, dấu sao khi lên cấp.
// Không đọc hay ghi trạng thái game: mọi luật chơi vẫn do server quyết định.
// Toạ độ theo bến (270×480); hiệu ứng được đặt bằng % của khung game nên co giãn theo màn hình.

import { seatPosition } from '../layout.js';

// Kích thước hiển thị (đơn vị bến) của từng hiệu ứng.
const DISPLAY = {
  splash: [24, 24], burst_common: [40, 40], burst_rare: [48, 48], burst_epic: [60, 60], burst_legendary: [84, 84],
  rays: [96, 96], rain: [270, 480], levelup: [32, 32], hearts: [28, 32], poof: [24, 24],
};
const MAX_ACTIVE = 36;
// Ưu tiên: khi đầy, hiệu ứng quan trọng hơn sẽ thay hiệu ứng nhỏ đang chạy (mặc định 1).
const PRIORITY = { rain: 3, rays: 3, burst_legendary: 3, burst_epic: 2, burst_rare: 2, levelup: 2 };
const TIER_BURST = { trash: 'poof', common: 'burst_common', rare: 'burst_rare', epic: 'burst_epic', legendary: 'burst_legendary' };
const defaultFetch = (name) => fetch(`/game/lottie/${name}.json`).then((r) => (r.ok ? r.json() : null));
const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createEffects(container, config, { lottie = globalThis.lottie, fetchData = defaultFetch } = {}) {
  const ui = config.ui;
  const cache = new Map();
  let active = 0;
  const enabled = Boolean(lottie) && !reduceMotion();
  const lastPhase = new Map(); // chỉ số ghế -> { userId, phase }
  const live = new Set(); // hiệu ứng đang chạy: { prio, finish }

  // Thay hiệu ứng có ưu tiên thấp nhất (nếu thấp hơn p). Trả về true nếu đã giải phóng một chỗ.
  function evictFor(p) {
    let victim = null;
    for (const e of live) if (e.prio < p && (!victim || e.prio < victim.prio)) victim = e;
    if (!victim) return false;
    victim.finish();
    return true;
  }
  let lastSeats = [];

  function data(name) {
    if (!cache.has(name)) cache.set(name, fetchData(name).catch(() => null));
    return cache.get(name);
  }

  // Đặt một hiệu ứng tại (x,y) đơn vị bến. scale phóng hiệu ứng gốc; hiệu ứng hết thì tự gỡ.
  function play(name, x, y, { scale = 1, flip = false } = {}) {
    if (!enabled || !DISPLAY[name]) return;
    const prio = PRIORITY[name] ?? 1;
    if (active >= MAX_ACTIVE && !evictFor(prio)) return;
    const [w, h] = DISPLAY[name];
    const dw = w * scale, dh = h * scale;
    const node = document.createElement('div');
    node.className = 'fx-item';
    node.style.left = `${(x / 270) * 100}%`;
    node.style.top = `${(y / 480) * 100}%`;
    node.style.width = `${(dw / 270) * 100}%`;
    node.style.height = `${(dh / 480) * 100}%`;
    if (flip) node.style.transform = 'translate(-50%,-50%) scaleX(-1)';
    container.appendChild(node);
    active++;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      active--;
      live.delete(entry);
      try { anim?.destroy(); } catch { /* đã gỡ */ }
      node.remove();
    };
    let anim = null;
    const entry = { prio, finish };
    live.add(entry);
    data(name).then((animationData) => {
      if (done) return;
      if (!animationData) { finish(); return; }
      anim = lottie.loadAnimation({
        container: node, renderer: 'svg', loop: false, autoplay: true,
        animationData: structuredClone(animationData),
      });
      anim.addEventListener('complete', finish);
      // Dự phòng: nếu sự kiện complete không đến, vẫn gỡ sau thời lượng + một chút.
      setTimeout(finish, (animationData.op / animationData.fr) * 1000 + 300);
    });
  }

  const bobber = (i) => { const p = seatPosition(i, ui); return { x: p.x + 26, y: p.y + 28 }; };
  const fishAt = (i) => { const p = seatPosition(i, ui); return { x: p.x + 17, y: p.y - 28 }; };
  const headAt = (i) => { const p = seatPosition(i, ui); return { x: p.x, y: p.y - 44 }; };
  const CENTER = { x: 135, y: 240 };

  function onEvents(events) {
    if (!enabled || !Array.isArray(events)) return;
    for (const ev of events) {
      if (!ev || typeof ev !== 'object') continue;
      const i = ev.seatIndex;
      switch (ev.kind) {
        case 'bite': {
          const b = bobber(i);
          play('splash', b.x, b.y, { scale: 1.2 });
          play('burst_common', b.x, b.y - 4, { scale: 0.5 });
          break;
        }
        case 'miss': {
          const b = bobber(i);
          play('poof', b.x, b.y, { scale: 0.9 });
          break;
        }
        case 'catch': {
          const f = fishAt(i);
          const tier = ev.tier ?? 'common';
          if (tier === 'trash' || !ev.kg) play('poof', f.x, f.y);
          else play(TIER_BURST[tier], f.x, f.y);
          if (tier === 'legendary') {
            play('rays', f.x, f.y, { scale: 1.1 });
            play('rain', CENTER.x, CENTER.y);
          } else if (tier === 'epic') {
            play('rays', f.x, f.y, { scale: 0.9 });
          }
          // Mặt nước văng tóe khi cá được kéo lên
          const b = bobber(i);
          play('splash', b.x, b.y, { scale: 0.9 });
          break;
        }
        case 'level_up': {
          const h = headAt(i);
          play('levelup', h.x, h.y, { scale: 1.1 });
          break;
        }
        case 'seat': {
          const p = seatPosition(i, ui);
          play('poof', p.x, p.y - 6, { scale: 1.1 });
          break;
        }
        case 'leave': {
          const p = seatPosition(i, ui);
          play('poof', p.x, p.y - 6, { scale: 0.9 });
          break;
        }
        case 'gift': {
          if (ev.effect === 'legendary') {
            // Cả bến reo hò: tia sáng, mưa vụn và cú nổ ở mọi ghế đang có người
            play('rays', CENTER.x, CENTER.y, { scale: 1.7 });
            play('rain', CENTER.x, CENTER.y);
            lastSeats.forEach((seat, idx) => {
              if (!seat) return;
              const f = fishAt(idx);
              play('burst_legendary', f.x, f.y, { scale: 0.9 });
            });
          } else {
            for (const x of [50, 135, 220]) play('hearts', x, 300 + (x % 3) * 20, { scale: 1.1 });
          }
          break;
        }
        case 'follow_thanks':
        case 'share_thanks':
          for (const x of [70, 200]) play('hearts', x, 260, { scale: 1 });
          break;
        default:
          break;
      }
    }
  }

  // Khi ghế đổi giai đoạn: phao chạm nước (thả cần xong) và bắn tóe khi kéo cần.
  function onSnapshot(seats) {
    lastSeats = seats;
    if (!enabled) return;
    seats.forEach((seat, i) => {
      const prev = lastPhase.get(i);
      if (!seat) { lastPhase.delete(i); return; }
      if (prev && prev.userId === seat.userId && prev.phase !== seat.phase) {
        if (prev.phase === 'casting' && seat.phase === 'waiting') {
          const b = bobber(i);
          play('splash', b.x, b.y, { scale: 0.8 });
        } else if (prev.phase === 'bite' && seat.phase === 'reeling') {
          const b = bobber(i);
          play('splash', b.x, b.y, { scale: 1.1 });
        }
      }
      lastPhase.set(i, { userId: seat.userId, phase: seat.phase });
    });
  }

  return { onEvents, onSnapshot, play, enabled };
}
