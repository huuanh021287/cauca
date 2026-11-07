// Điểm vào: nạp config, chạy server, lưu dữ liệu khi tắt.
import { loadConfig, ConfigError } from './config/loadConfig.js';
import { startServer } from './app.js';

let config;
try {
  config = loadConfig();
} catch (err) {
  if (err instanceof ConfigError) {
    console.error('Config không hợp lệ:');
    for (const line of err.errors) console.error(`  - ${line}`);
    process.exit(1);
  }
  throw err;
}

let app;
try {
  app = await startServer(config);
} catch (err) {
  if (err?.code === 'EADDRINUSE') {
    console.error(`Cổng ${config.server.port} đang bận — có thể game đã chạy ở cửa sổ khác. Hãy tắt cửa sổ đó (Ctrl+C) rồi chạy lại.`);
    process.exit(1);
  }
  throw err;
}
console.log(`Câu Cá chạy tại http://localhost:${app.port}`);

// Tắt êm: lưu dữ liệu rồi thoát. Lỗi khi tắt vẫn thoát; nhận tín hiệu lần hai thì thoát ngay.
let closing = false;
const shutdown = async () => {
  if (closing) {
    console.error('Thoát ngay (chưa kịp lưu xong).');
    process.exit(1);
  }
  closing = true;
  console.log('Đang lưu dữ liệu và tắt...');
  try {
    await app.close();
  } catch (err) {
    console.error(`Lỗi khi tắt: ${err.stack ?? err}`);
    process.exit(1);
  }
  process.exit(0);
};
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, shutdown);
