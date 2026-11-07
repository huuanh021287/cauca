// Chọn bậc cá, cá cụ thể và cân nặng; tính điểm kinh nghiệm của một mẻ cá.
const TIER_ORDER = ['trash', 'common', 'rare', 'epic', 'legendary'];

const round1 = (x) => Math.round(x * 10) / 10;

export function tierWeights(config, { bait = false, legendary = false } = {}) {
  const w = {};
  for (const t of TIER_ORDER) w[t] = config.tiers[t] ?? 0;
  if (!legendary) {
    w.common += w.legendary;
    w.legendary = 0;
  }
  if (bait) {
    const m = config.rewards.baitMultiplier;
    let added = 0;
    for (const t of ['rare', 'epic']) {
      const next = w[t] * (m[t] ?? 1);
      added += next - w[t];
      w[t] = next;
    }
    w.common = Math.max(0, w.common - added);
  }
  return w;
}

export function rollCatch(config, { bait = false, legendary = false, reelBonus = false } = {}, rng) {
  const weights = tierWeights(config, { bait, legendary });
  const roll = rng() * 100;
  let acc = 0;
  let tier = null;
  for (const t of TIER_ORDER) {
    if (weights[t] <= 0) continue;
    acc += weights[t];
    tier = t;
    if (roll < acc) break;
  }
  const pool = config.fish.filter((f) => f.tier === tier);
  const fish = pool[Math.floor(rng() * pool.length)];
  if (tier === 'trash' || !fish.weightKg) {
    return { fishId: fish.id, fishName: fish.name, tier, kg: 0 };
  }
  const [min, max] = fish.weightKg;
  let kg = min + rng() * (max - min);
  if (reelBonus) kg *= config.fishing.reelBonusMultiplier;
  return { fishId: fish.id, fishName: fish.name, tier, kg: round1(kg) };
}

export function xpForCatch(config, result) {
  if (result.tier === 'trash' || result.kg === 0) return config.xp.trashXp;
  return Math.round(result.kg * config.xp.perKg);
}
