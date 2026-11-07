// Lớp chữ SVG (#hudtext): nhận các lệnh vẽ chữ của HUD qua setTextSink() và hiển thị bằng <text>.
// Chữ là vector nên nét ở mọi tỉ lệ; transform và độ trong suốt lấy từ ctx đang vẽ, nên popup vẫn
// phóng to và mờ dần đúng như bản canvas. Các phần tử được tái sử dụng qua một pool, không tạo mới mỗi khung.

import { FONT_SANS } from '../text.js';

const NS = 'http://www.w3.org/2000/svg';
const ANCHOR = { left: 'start', center: 'middle', right: 'end' };

export function createTextLayer(svg) {
  const measurer = document.createElement('canvas').getContext('2d');
  const pool = [];
  let used = 0;

  function take() {
    let n = pool[used];
    if (!n) {
      n = document.createElementNS(NS, 'text');
      n._a = {};
      svg.appendChild(n);
      pool.push(n);
    }
    used++;
    if (n.style.visibility !== 'visible') n.style.visibility = 'visible';
    return n;
  }

  // Chỉ ghi thuộc tính khi đổi (ghi DOM ít nhất có thể). undefined = bỏ thuộc tính.
  function apply(n, attrs, str) {
    for (const k of Object.keys(attrs)) {
      const v = attrs[k];
      if (n._a[k] === v) continue;
      if (v === undefined) n.removeAttribute(k); else n.setAttribute(k, String(v));
      n._a[k] = v;
    }
    if (n._t !== str) { n.textContent = str; n._t = str; }
  }

  // Cùng chữ ký với canvas: (ctx, text, x, y, opts). Trả về bề rộng như drawOutlinedText.
  function sink(ctx, text, x, y, o = {}) {
    const str = String(text ?? '');
    const size = o.size ?? 24, weight = o.weight ?? 700, font = o.font ?? FONT_SANS;
    const color = o.color ?? '#ffffff', outline = o.outline ?? '#000', width = o.width ?? 6;
    measurer.font = `${weight} ${size}px ${font}`;
    const natural = measurer.measureText(str).width;
    const mw = Number.isFinite(o.maxWidth) && o.maxWidth > 0 ? o.maxWidth : null;
    const squeeze = mw !== null && natural > mw;
    const m = ctx.getTransform();
    const base = {
      x, y,
      transform: `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`,
      opacity: ctx.globalAlpha,
      'font-family': font, 'font-size': size, 'font-weight': weight,
      'text-anchor': ANCHOR[o.align ?? 'left'] ?? 'start',
      'dominant-baseline': o.baseline === 'middle' ? 'middle' : undefined,
      textLength: squeeze ? mw : undefined,
      lengthAdjust: squeeze ? 'spacingAndGlyphs' : undefined,
    };
    if (o.shadow) {
      apply(take(), {
        ...base, y: y + Math.max(3, size / 8), fill: o.shadow, stroke: 'none',
        'stroke-width': undefined, 'paint-order': undefined,
      }, str);
    }
    const stroked = width > 0;
    apply(take(), {
      ...base, fill: color,
      stroke: stroked ? outline : 'none',
      'stroke-width': stroked ? width : undefined,
      'stroke-linejoin': stroked ? 'round' : undefined,
      'stroke-miterlimit': stroked ? 2 : undefined,
      'paint-order': stroked ? 'stroke' : undefined,
    }, str);
    return squeeze ? mw : natural;
  }

  return {
    sink,
    begin() { used = 0; },
    end() {
      for (let i = used; i < pool.length; i++) {
        if (pool[i].style.visibility !== 'hidden') pool[i].style.visibility = 'hidden';
      }
    },
  };
}
