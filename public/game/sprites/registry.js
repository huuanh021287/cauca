// Bản đồ sprite: mỗi hình có một id. Mặc định vẽ bằng code; nếu config `assets`
// khai báo file PNG cho id đó thì vẽ ảnh thay thế (không cần sửa code).
//
// Quy ước tọa độ (x, y) là điểm neo: 'center' (giữa hình) hoặc 'bottom' (giữa cạnh dưới),
// hoặc 'topleft'. Ảnh PNG thay thế được vẽ đúng kích thước gốc theo pixel low-res
// (nhân thêm opts.scale nếu có), neo theo cùng quy ước.

const sprites = new Map();
const images = new Map();

export function registerSprite(id, drawFn, { anchor = 'center' } = {}) {
  sprites.set(id, { draw: drawFn, anchor });
}

export function hasSprite(id) {
  return sprites.has(id) || images.has(id);
}

export function drawSprite(ctx, id, x, y, opts = {}) {
  const img = images.get(id);
  const sp = sprites.get(id);
  if (img) {
    const s = opts.scale ?? 1;
    const w = img.naturalWidth * s, h = img.naturalHeight * s;
    const anchor = sp?.anchor ?? 'center';
    const left = anchor === 'topleft' ? x : x - w / 2;
    const top = anchor === 'topleft' ? y : anchor === 'bottom' ? y - h : y - h / 2;
    if (opts.flip) {
      ctx.save();
      ctx.translate(Math.round(left) + w, Math.round(top));
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, w, h);
      ctx.restore();
    } else {
      ctx.drawImage(img, Math.round(left), Math.round(top), w, h);
    }
    return true;
  }
  if (!sp) return false;
  sp.draw(ctx, x, y, opts);
  return true;
}

// assetsMap: {"fish.ca_loc": "assets/ca_loc.png"}; đường dẫn tương đối tính từ `base`.
// Khóa bắt đầu bằng '_' (ghi chú) bị bỏ qua. Ảnh lỗi thì giữ hình vẽ mặc định.
export function loadOverrides(assetsMap = {}, base = '/game/') {
  const baseUrl = new URL(base, location.href);
  const jobs = Object.entries(assetsMap ?? {})
    .filter(([id, src]) => !id.startsWith('_') && typeof src === 'string' && src)
    .map(([id, src]) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { images.set(id, img); resolve(true); };
      img.onerror = () => { console.warn(`Không tải được ảnh cho sprite ${id}: ${src}`); resolve(false); };
      img.src = new URL(src, baseUrl).href;
    }));
  return Promise.all(jobs);
}
