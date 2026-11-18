import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTikTokConnection } from '../server/tiktok/connection.js';

// Hồi quy: thư viện 2.5.0 ném lỗi nếu không truyền options. Khởi tạo không cần mạng.
test('tạo kết nối TikTok không ném lỗi (không cần mạng)', () => {
  const conn = createTikTokConnection('huuanh1987');
  assert.equal(typeof conn.connect, 'function');
  assert.equal(typeof conn.disconnect, 'function');
});
