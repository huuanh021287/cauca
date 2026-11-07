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

// Móc cho Task 11: onEvents(events) khi có DisplayEvent; drawHud(ctx, state, nowServer) mỗi khung hình
// (vẽ trên #hud sau phần nhân vật).
export const hooks = { onEvents: [], drawHud: [] };
export const state = { config: null, snapshot: null, offset: 0 };

const SKY_OVERRIDE = new URLSearchParams(location.search).get('sky'); // ?sky=day|dusk|night để xem thử

function runHooks(list, ...args) {
  for (const fn of list) {
    try { fn(...args); } catch (err) { console.error(err); }
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

  const pixel = document.getElementById('pixel');
  const hud = document.getElementById('hud');
  const { w, h } = lowRes(config.ui);
  pixel.width = w; pixel.height = h;
  hud.width = config.ui.width; hud.height = config.ui.height;
  const px = pixel.getContext('2d');
  const hx = hud.getContext('2d');
  px.imageSmoothingEnabled = false;

  const characters = createCharacters(config);

  connectWs((msg) => {
    if (msg.t === 'snapshot') {
      updateOffset(msg.data.serverNow);
      state.snapshot = msg.data;
    } else if (msg.t === 'events') {
      runHooks(hooks.onEvents, msg.data);
    }
  });

  function frame() {
    const t = performance.now();
    const nowServer = Date.now() + state.offset;
    const phase = ['day', 'dusk', 'night'].includes(SKY_OVERRIDE) ? SKY_OVERRIDE : skyPhase(new Date());
    const seats = state.snapshot?.seats ?? [];

    drawSceneBack(px, w, h, t, phase);
    for (const row of [0, 1]) {
      drawDockRow(px, w, rowY(row), t, phase);
      characters.drawRow(px, seats, row, nowServer);
    }
    drawSceneFront(px, w, h, t, phase);

    hx.clearRect(0, 0, hud.width, hud.height);
    characters.drawHud(hx, seats, nowServer);
    runHooks(hooks.drawHud, hx, state, nowServer);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

start().catch((err) => console.error('Không khởi động được trang game:', err));
