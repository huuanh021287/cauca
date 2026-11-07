import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANIMATIONS } from '../scripts/lottie-lib.js';

// Kiểm tra cấu trúc tối thiểu mà lottie-web cần; không có NaN hay khung âm.
const bad = (v) => typeof v === 'number' && !Number.isFinite(v);
function scan(node, where = 'root') {
  if (node === null || typeof node !== 'object') { assert.ok(!bad(node), `NaN tại ${where}`); return; }
  for (const [k, v] of Object.entries(node)) scan(v, `${where}.${k}`);
}

for (const [name, build] of Object.entries(ANIMATIONS)) {
  test(`lottie ${name}: cấu trúc hợp lệ`, () => {
    const d = build();
    assert.equal(d.v, '5.7.4');
    assert.equal(d.fr, 30);
    assert.ok(d.op > 0 && d.w > 0 && d.h > 0);
    assert.ok(Array.isArray(d.layers) && d.layers.length > 0);
    const inds = new Set();
    for (const l of d.layers) {
      assert.equal(l.ty, 4);
      assert.ok(!inds.has(l.ind), 'ind trùng');
      inds.add(l.ind);
      assert.ok(l.ks && l.ks.p && l.ks.s && l.ks.o);
      for (const g of l.shapes) assert.equal(g.ty, 'gr');
    }
    scan(d);
    assert.ok(JSON.stringify(d).length < 400_000, 'file quá lớn');
  });
}

test('sinh cùng kết quả khi gọi lại (hạt giống cố định)', () => {
  assert.equal(JSON.stringify(ANIMATIONS.burst_legendary()), JSON.stringify(ANIMATIONS.burst_legendary()));
});
