// Bộ sinh số ngẫu nhiên có thể gieo hạt (mulberry32) và bộ giả lập cho test.
export function createRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Chỉ dùng trong test: trả lần lượt các giá trị đã cho.
export function seqRng(values) {
  let i = 0;
  return function rng() {
    if (i >= values.length) throw new Error('seqRng hết giá trị');
    return values[i++];
  };
}
