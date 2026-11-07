// Sinh file Lottie JSON cho hiệu ứng trong public/game/lottie/. Chạy lại khi sửa scripts/lottie-lib.js:
//   node scripts/gen-lottie.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANIMATIONS } from './lottie-lib.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', 'public', 'game', 'lottie');
fs.mkdirSync(out, { recursive: true });
for (const [name, build] of Object.entries(ANIMATIONS)) {
  fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify(build()));
  console.log(`ok ${name}.json`);
}
