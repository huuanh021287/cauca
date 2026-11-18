// Bộ bọc mỏng quanh tiktok-live-connector v2 (không test đơn vị vì cần mạng).
// Trả về EventEmitter có connect() và disconnect(), phát các sự kiện 'chat', 'gift',
// 'disconnected', 'streamEnd', 'error'... đúng tên của thư viện.
import { TikTokLiveConnection } from 'tiktok-live-connector';

export function createTikTokConnection(username) {
  // tiktok-live-connector 2.5.0 đọc options.processInitialData ngay trong constructor,
  // nên bắt buộc truyền đối tượng (kể cả rỗng) — nếu không sẽ ném lỗi "reading 'processInitialData'".
  return new TikTokLiveConnection(username, {});
}
