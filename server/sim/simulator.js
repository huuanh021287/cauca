// Giả lập người xem để thử game không cần TikTok: tạo StdEvent với người giả `sim_<lần chạy>_<n>`.
// Mã lần chạy khác nhau mỗi lần mở server nên người giả không bao giờ được "chào quay lại".
// Hành động follow/share/quà/chat chỉ chọn người giả đang ngồi, không bao giờ mạo danh khán giả thật.
const HO = ['Tuấn Anh', 'Thu Hà', 'Minh Khoa', 'Lan Chi', 'Bảo Ngọc', 'Quốc Huy', 'Hải Yến', 'Đức Thắng', 'Mai Phương', 'Gia Bảo', 'Ngọc Trâm', 'Việt Hùng'];
const STORM_STEP_MS = 500;
const STORM_CHATS_PER_STEP = 2; // mỗi bước vài người gõ lệnh câu/kéo
const STORM_GIFT_EVERY_STEPS = 10; // khoảng 5 giây một món quà

// Xu của quà trong bão: phần lớn 1 xu, thỉnh thoảng 50, hiếm khi 500.
function stormGiftCoins(r) {
  if (r < 0.8) return 1;
  if (r < 0.97) return 50;
  return 500;
}

export function createSimulator({ rng, commands = { cast: 'cau', reel: 'keo' }, launchId = Date.now().toString(36) }) {
  let counter = 0;

  const newUser = () => {
    counter += 1;
    const name = `${HO[Math.floor(rng() * HO.length)]} ${counter}`;
    return { id: `sim_${launchId}_${counter}`, name, avatar: null };
  };
  const pickSeated = (seated) => {
    const sims = seated.filter((u) => String(u.id).startsWith('sim_'));
    return sims.length ? sims[Math.floor(rng() * sims.length)] : newUser();
  };

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

  // Bão like: `users` người cùng thả tim với tổng `likesPerMin`, kèm chat lệnh câu/kéo và quà ngẫu nhiên.
  // Trả về hàm dừng.
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
      const anyone = () => crowd[Math.floor(rng() * crowd.length)];
      for (let i = 0; i < perStep; i += 1) emit({ type: 'like', user: anyone(), count: 1 });
      for (let i = 0; i < STORM_CHATS_PER_STEP; i += 1) {
        emit({ type: 'chat', user: anyone(), text: rng() < 0.5 ? commands.cast : commands.reel });
      }
      if (step % STORM_GIFT_EVERY_STEPS === 0) {
        emit({ type: 'gift', user: anyone(), coins: stormGiftCoins(rng()), giftName: 'Quà giả lập' });
      }
      schedule(run, STORM_STEP_MS);
    };
    schedule(run, STORM_STEP_MS);
    return () => { stopped = true; };
  }

  return { make, storm };
}
