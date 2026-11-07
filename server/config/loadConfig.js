import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../config/game.config.json',
);
const TIERS = ['trash', 'common', 'rare', 'epic', 'legendary'];

export class ConfigError extends Error {
  constructor(errors) {
    super(`Config không hợp lệ:\n- ${errors.join('\n- ')}`);
    this.name = 'ConfigError';
    this.errors = errors;
  }
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isPos = (v) => isNum(v) && v > 0;
const isNonNeg = (v) => isNum(v) && v >= 0;
const isPosInt = (v) => Number.isInteger(v) && v > 0;
// Màn hình game vẽ đúng 2 hàng × 6 ghế.
const SCREEN_ROWS = 2, SEATS_PER_ROW = 6;

// Bỏ qua các khóa bắt đầu bằng "_" (ghi chú) - chỉ lấy khóa dữ liệu.
const dataKeys = (o) => Object.keys(o).filter((k) => !k.startsWith('_'));

export function validateConfig(cfg) {
  const errs = [];
  const err = (p, m) => errs.push(`${p}: ${m}`);

  if (!isObj(cfg)) return ['(gốc): config phải là một object'];

  const group = (name) => {
    if (!isObj(cfg[name])) {
      err(name, 'thiếu hoặc không phải object');
      return null;
    }
    return cfg[name];
  };
  const posFields = (name, fields) => {
    const g = group(name);
    if (!g) return;
    for (const f of fields) if (!isPos(g[f])) err(`${name}.${f}`, 'phải là số dương');
  };
  const range = (p, v) => {
    if (!Array.isArray(v) || v.length !== 2 || !v.every(isPos)) {
      err(p, 'phải là mảng [min, max] gồm hai số dương');
      return;
    }
    if (v[0] > v[1]) err(p, 'min > max');
  };

  posFields('dock', ['seats', 'rows', 'idleKickSeconds', 'queueMax', 'queueIdleSeconds']);
  if (isObj(cfg.dock)) {
    const { seats, rows } = cfg.dock;
    const screen = `màn hình game chỉ vẽ ${SCREEN_ROWS} hàng × ${SEATS_PER_ROW} ghế`;
    if (rows !== SCREEN_ROWS) err('dock.rows', `phải là ${SCREEN_ROWS} (${screen})`);
    if (!isPosInt(seats) || seats > SCREEN_ROWS * SEATS_PER_ROW) {
      err('dock.seats', `phải là số nguyên từ 1 tới ${SCREEN_ROWS * SEATS_PER_ROW} (${screen})`);
    }
  }

  const fi = group('fishing');
  if (fi) {
    for (const f of ['autoCastDelaySec', 'castSec', 'biteWindowSec', 'reelSec', 'resultSec',
      'likeReduceSec', 'reelBonusMultiplier']) {
      if (!isPos(fi[f])) err(`fishing.${f}`, 'phải là số dương');
    }
    range('fishing.waitSec', fi.waitSec);
    if (!isPos(fi.minWaitRatio) || fi.minWaitRatio > 1) err('fishing.minWaitRatio', 'phải trong khoảng (0, 1]');
  }

  const cm = group('commands');
  if (cm) {
    for (const f of ['cast', 'reel']) {
      if (!Array.isArray(cm[f]) || cm[f].length === 0 || !cm[f].every((s) => typeof s === 'string' && s)) {
        err(`commands.${f}`, 'phải là mảng chuỗi không rỗng');
      }
    }
  }

  const ti = group('tiers');
  if (ti) {
    let sum = 0;
    for (const t of TIERS) {
      if (!isNonNeg(ti[t])) err(`tiers.${t}`, 'phải là số không âm');
      else sum += ti[t];
    }
    for (const k of dataKeys(ti)) if (!TIERS.includes(k)) err(`tiers.${k}`, 'bậc không hợp lệ');
    if (Math.abs(sum - 100) > 1e-9) err('tiers', `tổng phải bằng 100 (hiện là ${sum})`);
  }

  if (!Array.isArray(cfg.fish) || cfg.fish.length === 0) {
    err('fish', 'phải là mảng không rỗng');
  } else {
    const seen = new Set();
    const count = Object.fromEntries(TIERS.map((t) => [t, 0]));
    cfg.fish.forEach((f, i) => {
      const p = `fish[${i}]`;
      if (!isObj(f)) return err(p, 'phải là object');
      if (typeof f.id !== 'string' || !f.id) err(`${p}.id`, 'phải là chuỗi không rỗng');
      else if (seen.has(f.id)) err(`${p}.id`, `id "${f.id}" bị trùng`);
      else seen.add(f.id);
      if (typeof f.name !== 'string' || !f.name) err(`${p}.name`, 'phải là chuỗi không rỗng');
      if (typeof f.sprite !== 'string' || !f.sprite) err(`${p}.sprite`, 'phải là chuỗi không rỗng');
      if (!TIERS.includes(f.tier)) err(`${p}.tier`, `bậc phải là một trong ${TIERS.join(', ')}`);
      else count[f.tier]++;
      if (f.tier === 'trash') {
        if (!isPos(f.xp)) err(`${p}.xp`, 'rác phải có xp là số dương');
      } else {
        range(`${p}.weightKg`, f.weightKg);
      }
    });
    for (const t of TIERS) if (count[t] === 0) err('fish', `bậc "${t}" chưa có cá nào`);
  }

  const xp = group('xp');
  if (xp) {
    for (const f of ['perKg', 'trashXp', 'curveBase', 'curveExp', 'maxLevel']) {
      if (!isPos(xp[f])) err(`xp.${f}`, 'phải là số dương');
    }
    if (isPos(xp.maxLevel) && !Number.isInteger(xp.maxLevel)) err('xp.maxLevel', 'phải là số nguyên');
  }

  if (!Array.isArray(cfg.titles) || cfg.titles.length === 0) {
    err('titles', 'phải là mảng không rỗng');
  } else {
    let next = 1;
    cfg.titles.forEach((t, i) => {
      const p = `titles[${i}]`;
      if (!isObj(t)) return err(p, 'phải là object');
      if (typeof t.name !== 'string' || !t.name) err(`${p}.name`, 'phải là chuỗi không rỗng');
      if (typeof t.rodColor !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(t.rodColor)) err(`${p}.rodColor`, 'phải là mã màu dạng #rrggbb');
      if (!Number.isInteger(t.from) || !Number.isInteger(t.to) || t.from > t.to) {
        return err(p, 'from/to phải là số nguyên và from ≤ to');
      }
      if (t.from !== next) err(p, `phải bắt đầu từ cấp ${next} (hở hoặc chồng nhau)`);
      next = t.to + 1;
    });
    const max = xp && xp.maxLevel;
    if (isPos(max) && next - 1 !== max) err('titles', `phải phủ kín từ cấp 1 tới ${max} (hiện tới ${next - 1})`);
  }

  if (!isPos(cfg.auraFromLevel)) err('auraFromLevel', 'phải là số dương');

  const rw = group('rewards');
  if (rw) {
    for (const k of ['follow', 'share']) {
      if (!isObj(rw[k])) err(`rewards.${k}`, 'thiếu hoặc không phải object');
      else {
        if (!isPos(rw[k].bait)) err(`rewards.${k}.bait`, 'phải là số dương');
        if (!isPos(rw[k].perSession)) err(`rewards.${k}.perSession`, 'phải là số dương');
      }
    }
    if (!isObj(rw.baitMultiplier)) err('rewards.baitMultiplier', 'thiếu hoặc không phải object');
    else for (const k of dataKeys(rw.baitMultiplier)) {
      if (!isPos(rw.baitMultiplier[k])) err(`rewards.baitMultiplier.${k}`, 'phải là số dương');
    }
  }

  if (!Array.isArray(cfg.gifts) || cfg.gifts.length === 0) {
    err('gifts', 'phải là mảng không rỗng');
  } else {
    let prevMax = 0;
    cfg.gifts.forEach((g, i) => {
      const p = `gifts[${i}]`;
      if (!isObj(g)) return err(p, 'phải là object');
      if (!isPos(g.minCoins)) return err(`${p}.minCoins`, 'phải là số dương');
      if (g.maxCoins !== null && !isPos(g.maxCoins)) return err(`${p}.maxCoins`, 'phải là số dương hoặc null');
      if (g.maxCoins !== null && g.minCoins > g.maxCoins) err(p, 'minCoins > maxCoins');
      if (prevMax === null) err(p, 'khoảng trước đã không giới hạn nên không thể có thêm khoảng sau');
      else if (g.minCoins <= prevMax) err(p, 'các khoảng xu phải tăng dần và không chồng nhau');
      prevMax = g.maxCoins;
      if (!['fast', 'bait', 'legendary'].includes(g.effect)) err(`${p}.effect`, 'phải là fast, bait hoặc legendary');
      if (g.effect === 'fast') {
        for (const f of ['fastSec', 'fastMaxSec']) if (!isPos(g[f])) err(`${p}.${f}`, 'phải là số dương');
        if (!isPos(g.waitMultiplier) || g.waitMultiplier > 1) err(`${p}.waitMultiplier`, 'phải trong khoảng (0, 1]');
      }
      if (g.effect === 'bait' && !isPosInt(g.bait)) err(`${p}.bait`, 'phải là số nguyên ≥ 1');
      if (g.fireworks !== undefined && g.fireworks !== null && !['small', 'big'].includes(g.fireworks)) {
        err(`${p}.fireworks`, 'phải là small hoặc big (hoặc bỏ trống)');
      }
    });
  }

  const lb = group('leaderboard');
  if (lb) for (const f of ['sessionTop', 'rotateSec']) if (!isPos(lb[f])) err(`leaderboard.${f}`, 'phải là số dương');

  const ui = group('ui');
  if (ui) {
    for (const f of ['width', 'height', 'nameMaxChars', 'maxPopups', 'popupSec', 'feedLines']) {
      if (!isPos(ui[f])) err(`ui.${f}`, 'phải là số dương');
    }
    for (const f of ['safeTop', 'safeBottom']) if (!isNonNeg(ui[f])) err(`ui.${f}`, 'phải là số không âm');
  }

  if (cfg.server && cfg.server.host !== undefined && (typeof cfg.server.host !== 'string' || !cfg.server.host)) err('server.host', 'phải là chuỗi không rỗng');
  posFields('server', ['port', 'tickMs', 'batchMs', 'snapshotMs', 'autosaveMs', 'maxDisplayEventsPerFlush']);
  if (isObj(cfg.server) && isPos(cfg.server.port) && (!Number.isInteger(cfg.server.port) || cfg.server.port > 65535)) {
    err('server.port', 'phải là số nguyên từ 1 tới 65535');
  }

  if (!isObj(cfg.assets)) err('assets', 'thiếu hoặc không phải object');

  return errs;
}

export function loadConfig(filePath = DEFAULT_PATH) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    throw new ConfigError([`(tệp): không đọc được "${filePath}": ${e.message}`]);
  }
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch (e) {
    throw new ConfigError([`(tệp): JSON sai cú pháp: ${e.message}`]);
  }
  const errors = validateConfig(obj);
  if (errors.length) throw new ConfigError(errors);
  return obj;
}
