// Pháo hoa hạt pixel. Toạ độ mô phỏng theo lưới low-res (270×480); vẽ ra canvas với hệ số `scale`
// (mỗi hạt là ô vuông scale×scale nên trên #hud trông y như pixel ×4 của cảnh).
// Mảng hạt cấp sẵn (pool) với trần cố định: không cấp phát mới mỗi khung, hết chỗ thì bỏ hạt mới.

const PALETTES = [
  ['#fff6c8', '#ffd23a', '#ff9a1f'], // vàng
  ['#ffe0e6', '#ff4f6d', '#c41e3a'], // đỏ
  ['#e6fbff', '#5fd3ff', '#2a7fd4'], // xanh
  ['#f7e6ff', '#c77dff', '#7b2cbf'], // tím
  ['#eaffd6', '#9ad14b', '#4a8a1c'], // xanh lá
];
const COLORS = PALETTES.flat();
const ROCKET = 0, SPARK = 1;
const GRAVITY = 38;   // px low-res / s²

export function createFireworks({ width = 270, skyTop = 50, skyBottom = 170, max = 400 } = {}) {
  const x = new Float32Array(max), y = new Float32Array(max);
  const vx = new Float32Array(max), vy = new Float32Array(max);
  const life = new Float32Array(max), maxLife = new Float32Array(max);
  const kind = new Uint8Array(max), pal = new Uint8Array(max), size = new Uint8Array(max);
  let count = 0;
  // Lịch bắn: [thời điểm, x, độ cao nổ, số hạt, bảng màu]; vòng tròn cố định.
  const SCHED = 32;
  const sAt = new Float64Array(SCHED).fill(Infinity);
  const sX = new Float32Array(SCHED), sY = new Float32Array(SCHED), sN = new Uint16Array(SCHED), sP = new Uint8Array(SCHED);
  let lastNow = null;
  let seed = 0x9e3779b9;
  // Ngẫu nhiên nội bộ cho hiệu ứng (không phải luật game).
  const rand = () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };

  function add(px, py, pvx, pvy, l, k, p, s) {
    if (count >= max) return false;
    const i = count++;
    x[i] = px; y[i] = py; vx[i] = pvx; vy[i] = pvy; life[i] = l; maxLife[i] = l; kind[i] = k; pal[i] = p; size[i] = s;
    return true;
  }

  function schedule(at, px, py, n, p) {
    for (let i = 0; i < SCHED; i++) {
      if (sAt[i] === Infinity) { sAt[i] = at; sX[i] = px; sY[i] = py; sN[i] = n; sP[i] = p; return; }
    }
  }

  function explode(px, py, n, p) {
    const base = p * 3;
    for (let j = 0; j < n; j++) {
      const a = (j / n) * Math.PI * 2 + rand() * 0.3;
      const sp = 22 + rand() * 30;
      add(px, py, Math.cos(a) * sp, Math.sin(a) * sp - 6, 0.9 + rand() * 0.8, SPARK, base + Math.floor(rand() * 3), rand() < 0.25 ? 2 : 1);
    }
  }

  // 'small': 2 quả; 'big': 7 quả rải 2.6 giây, quả cuối to nhất.
  function launch(type, now) {
    const shells = type === 'big' ? 7 : 2;
    for (let s = 0; s < shells; s++) {
      const delay = type === 'big' ? s * 380 + rand() * 120 : s * 260;
      const big = type === 'big' && s === shells - 1;
      schedule(now + delay, 30 + rand() * (width - 60), skyTop + rand() * (skyBottom - skyTop - 50),
        big ? 70 : type === 'big' ? 48 : 34, Math.floor(rand() * PALETTES.length));
    }
  }

  function update(now) {
    const dt = lastNow === null ? 0 : Math.min(0.05, Math.max(0, (now - lastNow) / 1000));
    lastNow = now;
    for (let i = 0; i < SCHED; i++) {
      if (sAt[i] > now) continue;
      // Pháo thăng thiên: bay từ mép nước lên độ cao nổ.
      const rise = 0.7;
      const fromY = skyBottom + 30;
      // Hạt pháo giữ số hạt sẽ nổ trong `size`.
      add(sX[i], fromY, 0, -(fromY - sY[i]) / rise - (GRAVITY * rise) / 2, rise, ROCKET, sP[i] * 3, Math.min(255, sN[i]));
      sAt[i] = Infinity;
    }
    let i = 0;
    while (i < count) {
      life[i] -= dt;
      if (life[i] <= 0) {
        if (kind[i] === ROCKET) {
          const px = x[i], py = y[i], n = size[i], p = Math.floor(pal[i] / 3);
          remove(i);
          explode(px, py, n, p);
          continue;
        }
        remove(i);
        continue;
      }
      vy[i] += GRAVITY * dt * (kind[i] === SPARK ? 0.6 : 1);
      const drag = kind[i] === SPARK ? 1 - 1.4 * dt : 1;
      vx[i] *= drag; vy[i] *= drag;
      x[i] += vx[i] * dt; y[i] += vy[i] * dt;
      i++;
    }
  }

  // Xóa bằng cách đổi chỗ với hạt cuối (O(1)).
  function remove(i) {
    const j = --count;
    if (i === j) return;
    x[i] = x[j]; y[i] = y[j]; vx[i] = vx[j]; vy[i] = vy[j];
    life[i] = life[j]; maxLife[i] = maxLife[j]; kind[i] = kind[j]; pal[i] = pal[j]; size[i] = size[j];
  }

  function draw(ctx, now, scale = 1) {
    update(now);
    const S = scale;
    const px = (v) => Math.round(v) * S;
    for (let i = 0; i < count; i++) {
      const t = life[i] / maxLife[i];
      if (kind[i] === ROCKET) {
        ctx.fillStyle = '#fff6c8';
        ctx.fillRect(px(x[i]), px(y[i]), S, 2 * S);
        ctx.fillStyle = 'rgba(255,200,120,0.5)';
        ctx.fillRect(px(x[i]), px(y[i]) + 2 * S, S, 2 * S);
        continue;
      }
      // Lấp lánh lúc tàn: nhấp nháy theo chỉ số hạt.
      if (t < 0.3 && ((i + Math.floor(now / 70)) & 1)) continue;
      const base = pal[i] - (pal[i] % 3);
      const shade = t > 0.7 ? base : t > 0.35 ? base + 1 : base + 2;
      ctx.fillStyle = COLORS[shade];
      const s = t > 0.6 ? size[i] : 1;
      ctx.fillRect(px(x[i]), px(y[i]), s * S, s * S);
    }
  }

  return { launch, draw, get count() { return count; } };
}
