'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { stubModule, fakeBot } = require('./helpers');

const saved = [];
let chatLanguage;
stubModule('../src/store/language-store', {
  getLanguage: () => chatLanguage,
  setLanguage: async (chatId, code) => {
    saved.push({ chatId, code });
    chatLanguage = code;
  },
});

const { register, languageKeyboard } = require('../src/handlers/language-select');
const { TARGET_LANGUAGES } = require('../src/languages');

const bot = fakeBot();
register(bot);
const [onAction] = bot.handlers.action;

/** ปุ่มทั้งหมดในคีย์บอร์ด เรียงตามที่ผู้ใช้เห็น */
function buttons() {
  return languageKeyboard().reply_markup.inline_keyboard.flat();
}

test('ปุ่มเลือกภาษามีครบทุกภาษาในตาราง รวมเวียดนาม', () => {
  const labels = buttons().map((button) => button.text);

  assert.deepEqual(labels, TARGET_LANGUAGES.map((lang) => lang.label));
  assert.ok(labels.includes('🇻🇳 เวียดนาม'));
  assert.equal(labels.length, 5);
});

test('ปุ่มเวียดนามส่ง callback ด้วยรหัส vi', () => {
  const vietnamese = buttons().find((button) => button.text.includes('เวียดนาม'));
  assert.equal(vietnamese.callback_data, 'lang:vi');
});

test('กดปุ่มเวียดนามแล้วบันทึกภาษา vi ลง store', async () => {
  const answered = [];
  const edited = [];
  const ctx = {
    chat: { id: 99 },
    match: ['lang:vi', 'vi'],
    answerCbQuery: async (text) => answered.push(text),
    editMessageText: async (text) => edited.push(text),
  };

  await onAction(ctx);

  assert.deepEqual(saved.at(-1), { chatId: 99, code: 'vi' });
  assert.deepEqual(answered, ['เลือกเวียดนามแล้ว']);
  assert.match(edited[0], /🇻🇳 เวียดนาม/);
});

test('รหัสภาษาที่ไม่รู้จักไม่ถูกบันทึก', async () => {
  const before = saved.length;
  const answered = [];
  const ctx = {
    chat: { id: 99 },
    match: ['lang:xx', 'xx'],
    answerCbQuery: async (text) => answered.push(text),
    editMessageText: async () => {
      throw new Error('ไม่ควรถูกเรียก');
    },
  };

  await onAction(ctx);

  assert.equal(saved.length, before);
  assert.deepEqual(answered, ['ไม่รู้จักภาษานี้']);
});

test('ข้อความต้อนรับของ /start ลิสต์ภาษาครบตามตาราง', () => {
  const { WELCOME_MESSAGE } = require('../src/handlers/start');

  for (const lang of TARGET_LANGUAGES) {
    const name = lang.label.replace(/^\S+\s*/, '');
    assert.ok(WELCOME_MESSAGE.includes(name), `ไม่พบ "${name}" ในข้อความต้อนรับ`);
  }
});
