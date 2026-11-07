// Bộ nghe TikTok: kết nối theo @username, chuyển sự kiện thô qua normalizeTikTok,
// tự kết nối lại (5s → 10s → 30s, sau đó cứ 30s một lần) và báo trạng thái cho admin.
import { normalizeTikTok, TIKTOK_EVENTS } from '../events/normalize.js';

const RETRY_DELAYS_MS = [5000, 10000, 30000];
const NOT_LIVE_DELAY_MS = 30000;
const NOT_LIVE_PATTERN = /offline|isn'?t online|LIVE has ended/i;

function retryDelay(attempt) {
  return RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
}

export function createListener({
  config,
  connect,
  onEvent,
  onStatus,
  schedule = setTimeout,
  cancel = clearTimeout,
}) {
  let generation = 0; // tăng mỗi lần start/stop để bỏ qua sự kiện muộn của kết nối cũ
  let conn = null;
  let timer = null;
  let attempt = 0;
  let currentUsername = '';

  const status = (tiktok, message) => onStatus({ tiktok, message });

  function clearTimer() {
    if (timer !== null) {
      cancel(timer);
      timer = null;
    }
  }

  function dropConnection() {
    const old = conn;
    conn = null;
    if (!old) return;
    old.removeAllListeners?.();
    old.on?.('error', () => {}); // tránh ném lỗi chưa có listener sau khi gỡ
    Promise.resolve()
      .then(() => old.disconnect())
      .catch(() => {});
  }

  function scheduleRetry(gen, delay, notLive) {
    clearTimer();
    const seconds = Math.round(delay / 1000);
    status(
      notLive ? 'not_live' : 'retrying',
      notLive
        ? `Kênh chưa live, thử lại sau ${seconds} giây`
        : `Mất kết nối, thử lại sau ${seconds} giây`,
    );
    timer = schedule(() => {
      timer = null;
      if (gen === generation) attemptConnect(gen);
    }, delay);
  }

  function handleLost(gen, err) {
    if (gen !== generation) return;
    dropConnection();
    const notLive = err ? NOT_LIVE_PATTERN.test(String(err.message ?? err)) : false;
    const delay = notLive ? NOT_LIVE_DELAY_MS : retryDelay(attempt);
    attempt += 1;
    scheduleRetry(gen, delay, notLive);
  }

  function attemptConnect(gen) {
    const username = currentUsername;
    status('connecting', `Đang kết nối tới @${username}...`);
    const c = connect(username);
    conn = c;
    let lost = false;
    const lose = (err) => {
      if (lost || gen !== generation) return;
      lost = true;
      handleLost(gen, err);
    };
    for (const name of TIKTOK_EVENTS) {
      c.on(name, (data) => {
        if (gen !== generation) return;
        const ev = normalizeTikTok(name, data, config);
        if (ev) onEvent(ev);
      });
    }
    c.on('disconnected', () => lose());
    c.on('streamEnd', () => lose());
    c.on('error', () => {}); // lỗi kết nối đã được xử lý qua connect()/disconnected
    Promise.resolve()
      .then(() => c.connect())
      .then(
        () => {
          if (gen !== generation || lost) return;
          attempt = 0;
          status('connected', `Đã kết nối tới @${username}`);
        },
        (err) => lose(err ?? new Error('connect failed')),
      );
  }

  function stop() {
    generation += 1;
    clearTimer();
    dropConnection();
    attempt = 0;
    status('offline', 'Đã ngắt kết nối');
  }

  function start(username) {
    if (conn || timer !== null) {
      generation += 1;
      clearTimer();
      dropConnection();
    }
    generation += 1;
    attempt = 0;
    currentUsername = String(username ?? '').trim().replace(/^@+/, '').trim();
    if (!currentUsername) {
      status('error', 'Tên người dùng TikTok không hợp lệ');
      return;
    }
    attemptConnect(generation);
  }

  return { start, stop };
}
