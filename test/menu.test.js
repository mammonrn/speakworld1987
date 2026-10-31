'use strict';

process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

const { BOT_COMMANDS, registerMenu } = require('../src/menu');
const { registerHandlers } = require('../src/handlers');
const { setLanguage } = require('../src/store/language-store');
const { TARGET_LANGUAGES } = require('../src/languages');

/** บอทปลอมที่จดชื่อคำสั่งที่ handler ลงทะเบียนจริง (bot.start / bot.command) */
function registeredCommands() {
  const names = new Set();
  const bot = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'start') return () => names.add('start');
        if (prop === 'command') {
          return (name) => (Array.isArray(name) ? name : [name]).forEach((n) => names.add(n));
        }
        return () => {};
      },
    }
  );
  registerHandlers(bot);
  return names;
}

test('เมนูตรงกับคำสั่งที่ handler ลงทะเบียนจริงทั้งสองทาง (ยกเว้นคำสั่งแอดมินที่ไม่อยู่ในเมนู)', () => {
  const menu = new Set(BOT_COMMANDS.map((c) => c.command));
  assert.deepEqual([...menu].sort(), [...registeredCommands()].sort());
});

test('เมนูภาษา 6 ตัวตามลำดับที่ใช้บ่อย และคำอธิบายขึ้นต้นด้วยธงชาติ', () => {
  assert.deepEqual(
    BOT_COMMANDS.slice(0, 6).map((c) => c.command),
    ['hk', 'zh', 'en', 'kk', 'my', 'vi']
  );
  for (const { description } of BOT_COMMANDS.slice(0, 6)) {
    assert.match(description, /^\p{Regional_Indicator}{2} /u);
  }
});

test('ชื่อคำสั่งเป็น a-z0-9_ และคำอธิบายสั้นไม่เกิน 40 ตัวอักษร', () => {
  for (const { command, description } of BOT_COMMANDS) {
    assert.match(command, /^[a-z0-9_]{1,32}$/);
    assert.ok(description.length > 0 && description.length <= 40, command);
  }
});

test('คำสั่งลัดทุกตัวชี้ไปยังภาษาที่มีในตาราง', () => {
  const { QUICK_LANGUAGE_COMMANDS } = require('../src/handlers/language-select');
  const codes = new Set(TARGET_LANGUAGES.map((l) => l.code));
  for (const { code } of QUICK_LANGUAGE_COMMANDS) assert.ok(codes.has(code), code);
});

test('คำสั่งลัด /hk ตั้งภาษา yue และตอบ ✅ ตั้งเป็น ... แล้ว', async () => {
  const handlers = new Map();
  const bot = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'command') return (name, fn) => handlers.set(name, fn);
        return () => {};
      },
    }
  );
  require('../src/handlers/language-select').register(bot);
  const replies = [];
  await handlers.get('hk')({ chat: { id: 987654 }, reply: async (t) => replies.push(t) });
  assert.match(replies[0], /^✅ ตั้งเป็น กวางตุ้ง/);
  assert.equal(require('../src/store/language-store').getLanguage(987654), 'yue');
  void setLanguage;
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
