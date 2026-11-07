// Bảng xếp hạng: top kg trong phiên + kỷ lục hôm nay.
export function leaderboard({ sessionKg, store, now, top }) {
  const session = [...sessionKg]
    .map(([userId, kg]) => ({ name: store.get(userId)?.name ?? '', kg: Math.round(kg * 10) / 10 }))
    .filter((e) => e.kg > 0)
    .sort((a, b) => b.kg - a.kg)
    .slice(0, top);
  return { session, today: store.todayRecord(now) };
}
