// Giả lập người xem để thử game không cần TikTok: tạo StdEvent với người giả `sim_<n>`.
const HO = ['Tuấn Anh', 'Thu Hà', 'Minh Khoa', 'Lan Chi', 'Bảo Ngọc', 'Quốc Huy', 'Hải Yến', 'Đức Thắng', 'Mai Phương', 'Gia Bảo', 'Ngọc Trâm', 'Việt Hùng'];
const STORM_STEP_MS = 500;

export function createSimulator({ rng, commands = { cast: 'cau', reel: 'keo' } }) {
  let counter = 0;

  const newUser = () => {
    counter += 1;
    const name = `${HO[Math.floor(rng() * HO.length)]} ${counter}`;
    return { id: `sim_${counter}`, name, avatar: null };
  };
  const pickSeated = (seated) => (seated.length ? seated[Math.floor(rng() * seated.length)] : newUser());

  function make(kind, opts = {}, seated = []) {
    switch (kind) {
      case 'join1':
        return [{ type: 'join', user: newUser() }];
      case 'join20':
        return Array.from({ length: 20 }, () => ({ type: 'join', user: newUser() }));
      case 'likes500':
        return [{ type: 'like', user: pickSeated(seated), count: 500 }];
      case 'gift':
        return [{ type: 'gift', user: pickSeated(seated), coins: opts.coins ?? 1, giftName: 'Quà giả lập' }];
      case 'follow':
        return [{ type: 'follow', user: pickSeated(seated) }];
      case 'share':
        return [{ type: 'share', user: pickSeated(seated) }];
      case 'chatCast':
        return [{ type: 'chat', user: pickSeated(seated), text: commands.cast }];
      case 'chatReel':
        return [{ type: 'chat', user: pickSeated(seated), text: commands.reel }];
      default:
        return [];
    }
  }

  // Bão like: `users` người cùng thả tim với tổng `likesPerMin`. Trả về hàm dừng.
  function storm({ durationSec, users, likesPerMin }, emit, schedule) {
    const crowd = Array.from({ length: users }, newUser);
    const steps = Math.round((durationSec * 1000) / STORM_STEP_MS);
    const perStep = Math.round((likesPerMin / 60) * (STORM_STEP_MS / 1000));
    let stopped = false;
    let step = 0;
    crowd.forEach((user) => emit({ type: 'join', user }));
    const run = () => {
      if (stopped || step >= steps) return;
      step += 1;
      for (let i = 0; i < perStep; i += 1) {
        emit({ type: 'like', user: crowd[Math.floor(rng() * crowd.length)], count: 1 });
      }
      schedule(run, STORM_STEP_MS);
    };
    schedule(run, STORM_STEP_MS);
    return () => { stopped = true; };
  }

  return { make, storm };
}
