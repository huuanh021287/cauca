// Trang game (OBS / TikTok LIVE Studio quay màn hình này).
// Lấy config, nạp ảnh thay thế, nghe WebSocket, giữ snapshot mới nhất và độ lệch đồng hồ,
// rồi vẽ mỗi khung hình: cảnh + nhân vật trên #pixel (low-res), chữ và avatar trên #hud.

import { connectWs } from '/shared/ws.js';
import { lowRes, rowY, skyPhase } from './layout.js';
import { loadOverrides } from './sprites/registry.js';
import { registerSceneSprites } from './sprites/scene.js';
import { registerCharacterSprites } from './sprites/character.js';
import { registerFishSprites } from './sprites/fish.js';
import { drawSceneBack, drawDockRow, drawSceneFront } from './render/scene.js';
import { createCharacters } from './render/characters.js';
import { createActors } from './render/actors.js';
import { createEffects } from './render/effects.js';
import { installHud } from './render/hud.js';
import { waitForFonts, setTextSink } from './text.js';
import { createTextLayer } from './render/textlayer.js';

// Móc cho lớp HUD (render/hud.js): onEvents(events) khi có DisplayEvent; drawHud(ctx, state, nowServer)
// mỗi khung hình (vẽ trên #hud sau phần nhân vật).
export const hooks = { onEvents: [], drawHud: [] };
export const state = { config: null, snapshot: null, offset: 0, fontsReady: false };

const SKY_OVERRIDE = new URLSearchParams(location.search).get('sky'); // ?sky=day|dusk|night để xem thử

// Mỗi móc chạy riêng: lỗi ở một móc không chặn móc khác.
function runHooks(list, ...args) {
  for (const fn of list) {
    try { fn(...args); } catch (err) { console.error(err); }
  }
}

// Móc vẽ: ctx luôn được restore kể cả khi móc ném lỗi.
function runDrawHooks(list, ctx, ...args) {
  for (const fn of list) {
    ctx.save();
    try { fn(ctx, ...args); } catch (err) { console.error(err); } finally { ctx.restore(); }
  }
}

function updateOffset(serverNow) {
  const sample = serverNow - Date.now();
  // Làm mượt để animation không giật theo độ trễ mạng; lệch lớn (đổi giờ máy) thì đặt lại luôn.
  state.offset = state.snapshot === null || Math.abs(sample - state.offset) > 1000
    ? sample
    : state.offset + (sample - state.offset) * 0.2;
}

async function start() {
  const config = await fetch('/config.json').then((r) => r.json());
  state.config = config;
  registerSceneSprites();
  registerCharacterSprites();
  registerFishSprites(config.fish);
  await loadOverrides(config.assets);
  // Chữ #hud chờ font web (tối đa 2s) để không vẽ bằng font dự phòng rồi nhảy; cảnh vẫn chạy ngay.
  waitForFonts(2000).then(() => { state.fontsReady = true; });
  installHud(hooks, state);

  const pixel = document.getElementById('pixel');
  const hud = document.getElementById('hud');
  const { w, h } = lowRes(config.ui);
  pixel.width = w; pixel.height = h;
  hud.width = config.ui.width; hud.height = config.ui.height;
  const px = pixel.getContext('2d');
  const hx = hud.getContext('2d');
  px.imageSmoothingEnabled = false;

  // Nhân vật vẽ bằng SVG trên #actors; canvas chỉ vẽ nền và ghế trống.
  const characters = createCharacters(config, { skipSeated: true });
  const actors = createActors(document.getElementById('actors'), config);
  const textLayer = createTextLayer(document.getElementById('hudtext'));
  // Hiệu ứng Lottie chỉ là hình ảnh; không đổi trạng thái game.
  const effects = createEffects(document.getElementById('fx'), config);
  hooks.onEvents.push((events) => effects.onEvents(events));
  // Quà Huyền thoại (≥100 xu): cả bến reo hò.
  hooks.onEvents.push((events) => {
    if (Array.isArray(events) && events.some((e) => e?.kind === 'gift' && e.effect === 'legendary')) {
      characters.cheer(Date.now() + state.offset);
      actors.cheer(Date.now() + state.offset);
    }
  });

  connectWs((msg) => {
    if (msg.t === 'snapshot') {
      updateOffset(msg.data.serverNow);
      state.snapshot = msg.data;
      effects.onSnapshot(msg.data.seats);
    } else if (msg.t === 'events') {
      runHooks(hooks.onEvents, msg.data);
    }
  });

  let lastErrorAt = -Infinity;
  function frame() {
    // Hẹn khung sau trước tiên: một lỗi vẽ không được làm đứng hình cả buổi live.
    requestAnimationFrame(frame);
    const t = performance.now();
    try {
      const nowServer = Date.now() + state.offset;
      const phase = ['day', 'dusk', 'night'].includes(SKY_OVERRIDE) ? SKY_OVERRIDE : skyPhase(new Date());
      const seats = state.snapshot?.seats ?? [];

      // Trạng thái vẽ sạch mỗi khung (phòng khi khung trước lỗi giữa chừng)
      for (const c of [px, hx]) { c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; }
      drawSceneBack(px, w, h, t, phase);
      for (const row of [0, 1]) {
        drawDockRow(px, w, rowY(row), t, phase);
        characters.drawRow(px, seats, row, nowServer);
      }
      drawSceneFront(px, w, h, t, phase);
      actors.update(seats, nowServer);

      hx.clearRect(0, 0, hud.width, hud.height);
      // Chữ HUD đi qua lớp SVG #hudtext; khung gỗ, icon và pháo hoa vẫn vẽ trên canvas.
      textLayer.begin();
      setTextSink(textLayer.sink);
      try {
        if (state.fontsReady) {
          characters.drawHud(hx, seats, nowServer);
          runDrawHooks(hooks.drawHud, hx, state, nowServer);
        }
      } finally {
        setTextSink(null);
        textLayer.end();
      }
    } catch (err) {
      if (t - lastErrorAt > 5000) { lastErrorAt = t; console.error('Lỗi vẽ khung hình:', err); }
    }
  }
  requestAnimationFrame(frame);
}

start().catch((err) => console.error('Không khởi động được trang game:', err));
