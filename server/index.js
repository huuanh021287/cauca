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

const app = await startServer(config);
console.log(`Câu Cá chạy tại http://localhost:${app.port}`);

let closing = false;
const shutdown = async () => {
  if (closing) return;
  closing = true;
  await app.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
