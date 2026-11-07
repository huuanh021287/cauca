// Tạo hoặc đổi tài khoản admin. Mật khẩu chỉ được băm (scrypt) rồi ghi vào data/admin.json (không commit).
//   node scripts/set-admin.js [tên_đăng_nhập]
// Mật khẩu được hỏi ẩn trong terminal. Tự động hoá: đặt biến CAUCA_ADMIN_PASSWORD.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '../server/auth/admin.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'data', 'admin.json');

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const write = rl._writeToOutput;
    rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(s); };
    rl.question(question, (answer) => { rl._writeToOutput = write; rl.close(); process.stdout.write('\n'); resolve(answer); });
  });
}

const username = (process.argv[2] ?? 'Admin').trim();
const password = process.env.CAUCA_ADMIN_PASSWORD ?? await askHidden('Mật khẩu admin mới: ');
if (!password || password.length < 8) {
  console.error('Mật khẩu phải có ít nhất 8 ký tự.');
  process.exit(1);
}
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify({ username, passwordHash: hashPassword(password), updatedAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
console.log(`Đã lưu tài khoản admin "${username}" tại data/admin.json (mật khẩu đã băm).`);
