// Bộ bọc mỏng quanh tiktok-live-connector v2 (không test đơn vị vì cần mạng).
// Trả về EventEmitter có connect() và disconnect(), phát các sự kiện 'chat', 'gift',
// 'disconnected', 'streamEnd', 'error'... đúng tên của thư viện.
import { TikTokLiveConnection } from 'tiktok-live-connector';

export function createTikTokConnection(username) {
  return new TikTokLiveConnection(username);
}
