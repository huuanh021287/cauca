// Kết nối WebSocket dùng chung cho /admin và /game. Tự kết nối lại sau 1–5 giây.
export function connectWs(onMessage, { onOpen, onClose } = {}) {
  let ws = null;
  let closed = false;

  function open() {
    ws = new WebSocket(`ws://${location.host}/ws`);
    ws.addEventListener('open', () => { if (onOpen) onOpen(); });
    ws.addEventListener('message', (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      onMessage(msg);
    });
    ws.addEventListener('close', () => {
      ws = null;
      if (onClose) onClose();
      if (!closed) setTimeout(open, 1000 + Math.random() * 4000);
    });
    ws.addEventListener('error', () => { try { ws.close(); } catch { /* bỏ qua */ } });
  }
  open();

  return {
    send(obj) {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
    },
  };
}
