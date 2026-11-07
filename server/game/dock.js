// Bến câu: ghế ngồi câu cá và hàng chờ. Không dùng Date.now(); `now` (ms) được truyền vào.
export function createDock(config) {
  const d = config.dock;
  return {
    seats: Array.from({ length: d.seats }, () => null),
    queue: [],
    queueMax: d.queueMax,
    idleKickMs: d.idleKickSeconds * 1000,
    queueIdleMs: d.queueIdleSeconds * 1000,
  };
}

export function seatOf(dock, userId) {
  return dock.seats.findIndex((s) => s !== null && s.user.id === userId);
}

// Mọi tương tác của người xem đi qua đây.
export function touch(dock, user, now) {
  const idx = seatOf(dock, user.id);
  if (idx !== -1) {
    dock.seats[idx].lastActive = now;
    dock.seats[idx].user = user;
    return { result: 'already_seated', seatIndex: idx };
  }
  const qi = dock.queue.findIndex((q) => q.user.id === user.id);
  if (qi !== -1) {
    const [entry] = dock.queue.splice(qi, 1);
    entry.user = user;
    entry.lastActive = now;
    dock.queue.unshift(entry);
    return { result: 'promoted' };
  }
  // Có người đang chờ thì người mới xếp sau họ (ghế trống sẽ được lấp ở sweepIdle).
  const free = dock.queue.length === 0 ? dock.seats.indexOf(null) : -1;
  if (free !== -1) {
    dock.seats[free] = { user, lastActive: now };
    return { result: 'seated', seatIndex: free };
  }
  if (dock.queue.length >= dock.queueMax) return { result: 'queue_full' };
  dock.queue.push({ user, lastActive: now });
  return { result: 'queued' };
}

// Đá người không hoạt động, bỏ người chờ quá lâu, rồi cho hàng chờ vào ghế trống.
export function sweepIdle(dock, now) {
  const left = [];
  const dropped = [];
  const filled = [];
  dock.seats.forEach((s, i) => {
    if (s !== null && now - s.lastActive >= dock.idleKickMs) {
      left.push({ userId: s.user.id, name: s.user.name, seatIndex: i });
      dock.seats[i] = null;
    }
  });
  dock.queue = dock.queue.filter((q) => {
    if (now - q.lastActive >= dock.queueIdleMs) {
      dropped.push({ userId: q.user.id, name: q.user.name });
      return false;
    }
    return true;
  });
  for (let i = 0; i < dock.seats.length && dock.queue.length > 0; i++) {
    if (dock.seats[i] === null) {
      const { user } = dock.queue.shift();
      dock.seats[i] = { user, lastActive: now };
      filled.push({ seatIndex: i, user });
    }
  }
  return { left, filled, dropped };
}

// Giải phóng ghế ngay; hàng chờ lấp chỗ ở lần sweepIdle kế tiếp.
export function kick(dock, userId) {
  const idx = seatOf(dock, userId);
  if (idx === -1) return false;
  dock.seats[idx] = null;
  return true;
}
