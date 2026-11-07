import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { loadConfig } from '../server/config/loadConfig.js';
import { startServer } from '../server/app.js';

test('server serves config, snapshot and reacts to sim join', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cauca-'));
  const app = await startServer(loadConfig(), { port: 0, dataFile: path.join(dir, 'players.json') });
  try {
    const base = `http://localhost:${app.port}`;
    const cfg = await (await fetch(`${base}/config.json`)).json();
    assert.ok(Array.isArray(cfg.fish) && cfg.fish.length > 0 && cfg.ui && cfg.leaderboard);
    assert.equal((await fetch(`${base}/..%2f..%2fpackage.json`)).status, 404);
    assert.equal((await fetch(`${base}/nope.html`)).status, 404);

    const ws = new WebSocket(`ws://localhost:${app.port}/ws`);
    const seated = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('quá hạn chờ snapshot có người ngồi')), 3000);
      let first = false;
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.t !== 'snapshot') return;
        if (!first) {
          first = true;
          assert.equal(msg.data.seats.filter(Boolean).length, 0);
          ws.send(JSON.stringify({ t: 'sim', kind: 'join1' }));
        } else if (msg.data.seats.filter(Boolean).length === 1) {
          clearTimeout(timer);
          resolve();
        }
      });
    });
    await seated;
    ws.close();
  } finally {
    await app.close();
  }
});
