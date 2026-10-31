'use strict';

process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { BOT_COMMANDS, registerMenu } = require('../src/menu');

/** คำสั่งที่ handler รองรับจริง: bot.start(...) = start และ bot.command('x') ทุกตัว */
function commandsInSource() {
  const dir = path.join(__dirname, '..', 'src', 'handlers');
  const found = new Set();
  for (const file of fs.readdirSync(dir)) {
    const text = fs.readFileSync(path.join(dir, file), 'utf8');
    if (/bot\.start\(/.test(text)) found.add('start');
    for (const m of text.matchAll(/bot\.command\(\s*'([a-z_]+)'/g)) found.add(m[1]);
  }
  return found;
}

test('เมนูตรงกับคำสั่งที่ handler รองรับจริงทั้งสองทาง', () => {
  const menu = new Set(BOT_COMMANDS.map((c) => c.command));
  assert.deepEqual([...menu].sort(), [...commandsInSource()].sort());
});

test('คำอธิบายเมนูสั้นไม่เกิน 40 ตัวอักษร และชื่อคำสั่งเป็นตัวพิมพ์เล็ก', () => {
  for (const { command, description } of BOT_COMMANDS) {
    assert.match(command, /^[a-z_]{1,32}$/);
    assert.ok(description.length > 0 && description.length <= 40, command);
  }
});

test('registerMenu เรียก setMyCommands + setChatMenuButton และไม่โยน error เมื่อล้ม', async () => {
  const calls = [];
  const ok = await registerMenu({
    setMyCommands: async (c) => calls.push(['cmd', c.length]),
    setChatMenuButton: async (b) => calls.push(['btn', b.menuButton.type]),
  });
  assert.equal(ok, true);
  assert.deepEqual(calls, [['cmd', BOT_COMMANDS.length], ['btn', 'commands']]);

  const failed = await registerMenu({
    setMyCommands: async () => {
      throw new Error('boom');
    },
  });
  assert.equal(failed, false);
});
