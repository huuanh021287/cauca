import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../server/config/loadConfig.js';
import { parseCommand } from '../server/game/commands.js';

const config = loadConfig();

test('cast commands: accents, case, extra words, punctuation', () => {
  for (const t of ['Câu', 'cau di', 'CÂU!!', '  câu  ', '!câu', 'câu cá vui quá']) {
    assert.equal(parseCommand(config, t), 'cast', t);
  }
});

test('reel commands', () => {
  for (const t of ['kéo', 'keo', 'KÉO!', 'Kéo đi']) assert.equal(parseCommand(config, t), 'reel', t);
});

test('non-commands return null', () => {
  for (const t of ['xin chào', '', '   ', 'cá câu', 'caucau', undefined, null]) {
    assert.equal(parseCommand(config, t), null, String(t));
  }
});

test('đ is folded to d', () => {
  const cfg = { ...config, commands: { cast: ['di'], reel: ['keo'] } };
  assert.equal(parseCommand(cfg, 'Đi'), 'cast');
});
