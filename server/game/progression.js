// Đường cong kinh nghiệm, lên cấp và danh hiệu.
export function xpToNext(config, level) {
  return Math.round(config.xp.curveBase * Math.pow(level, config.xp.curveExp));
}

// Sửa trực tiếp player, trả về số cấp vừa lên.
export function applyXp(config, player, gained) {
  const max = config.xp.maxLevel;
  if (player.level >= max) {
    player.level = max;
    player.xp = 0;
    return 0;
  }
  player.xp += gained;
  let ups = 0;
  while (player.level < max) {
    const need = xpToNext(config, player.level);
    if (player.xp < need) break;
    player.xp -= need;
    player.level += 1;
    ups += 1;
  }
  if (player.level >= max) player.xp = 0;
  return ups;
}

export function titleFor(config, level) {
  const t = config.titles.find((x) => level >= x.from && level <= x.to)
    ?? (level < config.titles[0].from ? config.titles[0] : config.titles[config.titles.length - 1]);
  return { name: t.name, rodColor: t.rodColor, aura: level >= config.auraFromLevel };
}
