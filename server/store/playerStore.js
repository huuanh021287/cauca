// Kho dữ liệu người chơi: đọc/ghi data/players.json an toàn (ghi file tạm rồi đổi tên).
import fs from 'node:fs/promises';
import path from 'node:path';

const pad = (n) => String(n).padStart(2, '0');

// Ngày theo giờ máy: 'YYYY-MM-DD'.
export function localDateKey(now) {
  const d = new Date(now);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function createPlayerStore(filePath, { log = console.warn } = {}) {
  let players = {};
  let records = {};
  const loadedIds = new Set();
  let dirty = false;
  let timer = null;
  let saving = null; // promise của lần ghi đang chạy
  let queued = null; // promise của lần ghi kế tiếp (chỉ một)

  async function load() {
    players = {};
    records = {};
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
      players = data.players;
      records = data.records && typeof data.records === 'object' ? data.records : {};
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
      const rec = records[key];
      if (!rec || kg > rec.kg) records[key] = { userId, fishId, fishName, kg };
    }
    dirty = true;
  }

  function todayRecord(now) {
    const rec = records[localDateKey(now)];
    if (!rec) return null;
    return { userId: rec.userId, name: players[rec.userId]?.name ?? '', fishName: rec.fishName, kg: rec.kg };
  }

  const markDirty = () => { dirty = true; };

  async function writeOnce() {
    dirty = false;
    const json = JSON.stringify({ version: 1, players, records });
    const tmp = `${filePath}.tmp`;
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(tmp, json);
    await fs.rename(tmp, filePath);
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
