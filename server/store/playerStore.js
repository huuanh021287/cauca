// Kho dữ liệu người chơi: đọc/ghi data/players.json an toàn (ghi file tạm rồi đổi tên).
import fs from 'node:fs/promises';
import path from 'node:path';

const pad = (n) => String(n).padStart(2, '0');

// Ngày theo giờ máy: 'YYYY-MM-DD'.
export function localDateKey(now) {
  const d = new Date(now);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Người chơi giả lập (nút thử ở admin) có id bắt đầu bằng `sim_`: chỉ sống trong bộ nhớ,
// không bao giờ ghi ra đĩa và không chiếm kỷ lục ngày đã lưu.
export const isSimId = (id) => String(id).startsWith('sim_');
const realOnly = (obj, idOf) => Object.fromEntries(Object.entries(obj).filter(([k, v]) => !isSimId(idOf(k, v))));

export function createPlayerStore(filePath, { log = console.warn } = {}) {
  let players = {};
  let records = {};
  let simRecords = {}; // kỷ lục ngày của người giả, chỉ trong phiên
  const loadedIds = new Set();
  let dirty = false;
  let timer = null;
  let saving = null; // promise của lần ghi đang chạy
  let queued = null; // promise của lần ghi kế tiếp (chỉ một)

  async function load() {
    players = {};
    records = {};
    simRecords = {};
    loadedIds.clear();
    let text;
    try {
      text = await fs.readFile(filePath, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') return;
      throw err;
    }
    try {
      const data = JSON.parse(text);
      if (!data || typeof data !== 'object' || typeof data.players !== 'object' || data.players === null) {
        throw new Error('sai cấu trúc players.json');
      }
      players = realOnly(data.players, (k) => k);
      records = data.records && typeof data.records === 'object'
        ? realOnly(data.records, (_, v) => v?.userId ?? '')
        : {};
      for (const id of Object.keys(players)) loadedIds.add(id);
    } catch (err) {
      const dir = path.dirname(filePath);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const corrupt = path.join(dir, `players.corrupt-${stamp}.json`);
      await fs.rename(filePath, corrupt);
      players = {};
      records = {};
      log(`players.json hỏng (${err.message}), đã đổi tên thành ${path.basename(corrupt)} và bắt đầu với dữ liệu trống`);
    }
  }

  function getOrCreate(user, now) {
    const iso = new Date(now).toISOString();
    let record = players[user.id];
    if (!record) {
      record = {
        name: user.name, avatar: user.avatar, xp: 0, level: 1, totalKg: 0, catches: 0,
        collection: {}, firstSeen: iso, lastSeen: iso,
      };
      players[user.id] = record;
    } else {
      record.name = user.name;
      record.avatar = user.avatar;
      record.lastSeen = iso;
    }
    dirty = true;
    return { record, isReturning: loadedIds.has(user.id) };
  }

  const get = (userId) => players[userId];

  function recordCatch(userId, catchResult, now) {
    const p = players[userId];
    if (!p) return;
    const { fishId, fishName, kg } = catchResult;
    p.catches += 1;
    p.totalKg = Math.round((p.totalKg + kg) * 1000) / 1000;
    const c = p.collection[fishId] ?? (p.collection[fishId] = { count: 0, bestKg: 0 });
    c.count += 1;
    if (kg > c.bestKg) c.bestKg = kg;
    if (kg > 0) {
      const key = localDateKey(now);
      const book = isSimId(userId) ? simRecords : records;
      const rec = book[key];
      if (!rec || kg > rec.kg) book[key] = { userId, fishId, fishName, kg };
    }
    dirty = true;
  }

  function todayRecord(now) {
    const key = localDateKey(now);
    const real = records[key];
    const sim = simRecords[key];
    const rec = sim && (!real || sim.kg > real.kg) ? sim : real;
    if (!rec) return null;
    return { userId: rec.userId, name: players[rec.userId]?.name ?? '', fishName: rec.fishName, kg: rec.kg };
  }

  const markDirty = () => { dirty = true; };

  async function writeOnce() {
    dirty = false;
    const json = JSON.stringify({ version: 1, players: realOnly(players, (k) => k), records });
    const tmp = `${filePath}.tmp`;
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(tmp, json);
      await fs.rename(tmp, filePath);
    } catch (err) {
      dirty = true; // giữ cờ để lần autosave sau thử lại
      await fs.rm(tmp, { force: true }).catch(() => {});
      throw err;
    }
  }

  function saveNow() {
    if (!saving) {
      saving = writeOnce().finally(() => { saving = null; });
      return saving;
    }
    // Đang ghi: chỉ chạy thêm đúng một lần nữa sau khi xong.
    if (!queued) {
      queued = saving.catch(() => {}).then(() => {
        queued = null;
        return saveNow();
      });
    }
    return queued;
  }

  function startAutosave(ms) {
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
      if (dirty) saveNow().catch((err) => log(`lỗi lưu players.json: ${err.message}`));
    }, ms);
    timer.unref?.();
  }

  async function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    await saveNow();
  }

  return { load, getOrCreate, get, recordCatch, todayRecord, markDirty, saveNow, startAutosave, stop };
}
