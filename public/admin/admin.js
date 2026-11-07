import { connectWs } from '/shared/ws.js';

const $ = (id) => document.getElementById(id);
const LAMP = { connected: 'connected', connecting: 'warn', retrying: 'warn', not_live: 'warn', error: 'error', offline: 'offline' };
const LABEL = {
  offline: 'Chưa kết nối', connecting: 'Đang kết nối…', connected: 'Đã kết nối',
  retrying: 'Đang thử lại…', not_live: 'Tài khoản chưa LIVE', error: 'Lỗi kết nối',
};

const ws = connectWs(onMessage, {
  onOpen: () => { $('offline').hidden = true; },
  onClose: () => { $('offline').hidden = false; },
});

$('connForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const username = $('username').value.trim().replace(/^@/, '');
  if (username) ws.send({ t: 'connect', username });
});
$('btnDisconnect').addEventListener('click', () => ws.send({ t: 'disconnect' }));

$('sims').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-kind]');
  if (!b) return;
  const msg = { t: 'sim', kind: b.dataset.kind };
  if (b.dataset.coins) msg.coins = Number(b.dataset.coins);
  ws.send(msg);
});
$('btnStorm').addEventListener('click', () => ws.send({ t: 'storm' }));

$('players').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-uid]');
  if (b) ws.send({ t: 'kick', userId: b.dataset.uid });
});

function onMessage(msg) {
  if (msg.t === 'status') render(msg.data);
}

function render(s) {
  $('lamp').className = 'lamp ' + (LAMP[s.tiktok] || 'offline');
  $('stateText').textContent = s.message || LABEL[s.tiktok] || s.tiktok;
  $('seated').textContent = s.seated;
  $('queued').textContent = s.queued;
  $('epm').textContent = s.eventsPerMin;
  const storm = $('btnStorm');
  storm.textContent = s.storm ? 'Dừng' : 'Bão sự kiện';
  storm.classList.toggle('on', !!s.storm);

  const list = $('players');
  list.replaceChildren(...s.players.map((p) => {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.className = 'name'; name.textContent = p.name;
    const lv = document.createElement('span');
    lv.className = 'lv'; lv.textContent = 'Cấp ' + p.level;
    const kick = document.createElement('button');
    kick.textContent = 'Kick'; kick.dataset.uid = p.userId;
    li.append(name, lv, kick);
    return li;
  }));
  $('empty').hidden = s.players.length > 0;
}
