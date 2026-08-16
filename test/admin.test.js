'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { SUPER_ADMIN_ID, fakeBot, fireAction } = require('./helpers');

const admin = require('../src/handlers/admin');
const start = require('../src/handlers/start');
const { approve, isApproved, listApproved } = require('../src/store/approved-users');
const { recordSpeech, recordTranslation, currentMonth } = require('../src/services/usage-tracker');

const bot = fakeBot();
admin.register(bot);
start.register(bot);
const [onStart] = bot.handlers.start;

const ALICE = { chatId: '600100', name: 'สมชาย' };
const BOB = { chatId: '600200', name: 'สมหญิง' };

/** ctx ของการกดปุ่ม เก็บทุกอย่างที่ handler ตอบกลับไว้ตรวจ */
function callbackCtx(userId = SUPER_ADMIN_ID) {
  const answered = [];
  const edited = [];
  const replies = [];

  return {
    from: { id: userId },
    chat: { id: userId },
    answered,
    edited,
    replies,
    answerCbQuery: async (text) => answered.push(text),
    editMessageText: async (text, extra) => edited.push({ text, extra }),
    reply: async (text) => replies.push(text),
  };
}

/** ปุ่มทั้งหมดในข้อความล่าสุดที่ถูกแก้ */
function buttonsOf(edit) {
  return (edit.extra?.reply_markup?.inline_keyboard || []).flat();
}

test.before(async () => {
  await approve(ALICE.chatId, { name: ALICE.name });
  await approve(BOB.chatId, { name: BOB.name });
});

test('/start ของผู้ดูแลมีปุ่มจัดการ user และเช็คค่าใช้จ่าย', async () => {
  const replies = [];
  await onStart({
    from: { id: SUPER_ADMIN_ID },
    reply: async (text, extra) => replies.push({ text, extra }),
  });

  const labels = buttonsOf(replies[0]).map((button) => button.text);
  assert.deepEqual(labels, [admin.MENU_LABELS.users, admin.MENU_LABELS.cost]);
});

test('/start ของผู้ใช้ทั่วไปไม่มีปุ่มผู้ดูแล', async () => {
  const replies = [];
  await onStart({
    from: { id: Number(ALICE.chatId) },
    reply: async (text, extra) => replies.push({ text, extra }),
  });

  assert.equal(replies[0].extra, undefined);
  assert.equal(replies[0].text, start.WELCOME_MESSAGE);
});

test('เมนูจัดการ user แสดงรายชื่อที่อนุมัติไว้เป็นปุ่ม', async () => {
  const ctx = callbackCtx();
  await fireAction(bot, 'admin:users', ctx);

  const buttons = buttonsOf(ctx.edited[0]);
  assert.deepEqual(
    buttons.map((button) => button.text),
    [`🗑 ${ALICE.name}`, `🗑 ${BOB.name}`]
  );
  assert.deepEqual(
    buttons.map((button) => button.callback_data),
    [`admin:remove:${ALICE.chatId}`, `admin:remove:${BOB.chatId}`]
  );
  assert.match(ctx.edited[0].text, /2 คน/);
});

test('กดชื่อแล้วขึ้นด่านยืนยันก่อน ยังไม่ลบทันที', async () => {
  const ctx = callbackCtx();
  await fireAction(bot, `admin:remove:${ALICE.chatId}`, ctx);

  assert.equal(isApproved(ALICE.chatId), true);
  assert.match(ctx.edited[0].text, /ยืนยันถอนสิทธิ์ สมชาย/);

  const labels = buttonsOf(ctx.edited[0]).map((button) => button.text);
  assert.deepEqual(labels, ['⚠️ ยืนยันลบ', '↩️ ยกเลิก']);
});

test('กดยกเลิกแล้วกลับมาที่รายชื่อโดยไม่ลบใคร', async () => {
  const ctx = callbackCtx();
  await fireAction(bot, 'admin:users', ctx);

  assert.equal(isApproved(ALICE.chatId), true);
  assert.equal(buttonsOf(ctx.edited[0]).length, 2);
});

test('กดยืนยันแล้วผู้ใช้ถูกถอนสิทธิ์จริง และรายชื่อถูกวาดใหม่', async () => {
  const ctx = callbackCtx();
  await fireAction(bot, `admin:remove-confirm:${ALICE.chatId}`, ctx);

  assert.equal(isApproved(ALICE.chatId), false);
  assert.deepEqual(ctx.answered, ['ถอนสิทธิ์ สมชาย แล้ว']);
  assert.deepEqual(
    listApproved().map((user) => user.chatId),
    [BOB.chatId]
  );
  assert.deepEqual(
    buttonsOf(ctx.edited[0]).map((button) => button.text),
    [`🗑 ${BOB.name}`]
  );
});

test('ลบจนหมดแล้วขึ้นข้อความว่าไม่มีผู้ใช้', async () => {
  const ctx = callbackCtx();
  await fireAction(bot, `admin:remove-confirm:${BOB.chatId}`, ctx);

  assert.equal(ctx.edited[0].text, admin.NO_USERS);
  assert.deepEqual(listApproved(), []);
});

test('กดลบคนที่ถูกลบไปแล้วไม่พัง', async () => {
  const ctx = callbackCtx();
  await fireAction(bot, `admin:remove:${ALICE.chatId}`, ctx);

  assert.deepEqual(ctx.answered, ['ไม่พบผู้ใช้คนนี้แล้ว']);
});

test('รายงานค่าใช้จ่ายแสดงทุกคนพร้อมยอดรวมของเดือนปัจจุบัน', async () => {
  recordSpeech(ALICE.chatId, 120, ALICE.name);
  recordTranslation(ALICE.chatId, 500, 'openai', ALICE.name);
  recordSpeech(BOB.chatId, 30, BOB.name);
  recordTranslation(BOB.chatId, 200, 'google', BOB.name);

  const ctx = callbackCtx();
  await fireAction(bot, 'admin:cost', ctx);

  const [report] = ctx.replies;
  assert.match(report, new RegExp(`เดือน ${currentMonth()}`));
  assert.match(report, /สมชาย/);
  assert.match(report, /สมหญิง/);
  assert.match(report, /เสียง 2 นาที 0 วิ/);
  assert.match(report, /openai 500 ตัวอักษร/);
  assert.match(report, /google 200 ตัวอักษร/);
  assert.match(report, /รวมทั้งหมด ≈ \$\d+\.\d{4} USD/);
  // เตือนไว้ว่าเป็นตัวเลขประมาณ ไม่ใช่บิลจริง
  assert.match(report, /ไม่ใช่ยอดบิลจริง/);
});

test('คนที่ถูกถอนสิทธิ์ไปแล้วยังอยู่ในรายงานค่าใช้จ่าย', async () => {
  const ctx = callbackCtx();
  await fireAction(bot, 'admin:cost', ctx);

  assert.equal(isApproved(ALICE.chatId), false);
  assert.match(ctx.replies[0], /สมชาย/);
});

test('formatDuration อ่านง่ายทั้งกรณีสั้นและยาว', () => {
  assert.equal(admin.formatDuration(45), '45 วิ');
  assert.equal(admin.formatDuration(60), '1 นาที 0 วิ');
  assert.equal(admin.formatDuration(185), '3 นาที 5 วิ');
});

test('ผู้ใช้ทั่วไปยิง callback ของผู้ดูแลเองไม่ได้', async () => {
  for (const data of [
    'admin:users',
    'admin:cost',
    `admin:remove:${BOB.chatId}`,
    `admin:remove-confirm:${BOB.chatId}`,
  ]) {
    const ctx = callbackCtx(Number(BOB.chatId));
    await fireAction(bot, data, ctx);

    assert.deepEqual(ctx.answered, ['เฉพาะผู้ดูแลระบบเท่านั้น'], data);
    assert.deepEqual(ctx.edited, [], data);
    assert.deepEqual(ctx.replies, [], data);
  }
});
