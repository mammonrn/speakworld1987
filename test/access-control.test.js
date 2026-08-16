'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { SUPER_ADMIN_ID, fakeBot, fireAction } = require('./helpers');

const accessControl = require('../src/handlers/access-control');
const { isApproved, listApproved, isPending } = require('../src/store/approved-users');

const bot = fakeBot();
accessControl.register(bot);
const [guard] = bot.handlers.use;

const STRANGER = { id: 500100, first_name: 'สมปอง', last_name: 'ใจกล้า', username: 'sompong' };

/** ข้อความที่บอทส่งตรงหา chat id (ใช้ดูว่าผู้ดูแลได้รับแจ้งไหม) */
let sent = [];

function ctxFor(from, { text = 'สวัสดี', chatId = from.id } = {}) {
  const replies = [];
  return {
    from,
    chat: { id: chatId },
    message: { message_id: 1, text },
    replies,
    reply: async (message) => replies.push(message),
    answerCbQuery: async () => {},
    editMessageText: async () => {},
    telegram: {
      sendMessage: async (target, message, extra) => {
        sent.push({ target, message, extra });
      },
    },
  };
}

/** เรียก middleware แล้วบอกว่ามันปล่อยผ่านไป handler ถัดไปหรือไม่ */
async function pass(ctx) {
  let nextCalled = false;
  await guard(ctx, async () => {
    nextCalled = true;
  });
  return nextCalled;
}

test('คนแปลกหน้าไม่ถูกประมวลผลต่อ และไม่ได้รับข้อความตอบกลับใดๆ', async () => {
  sent = [];
  const ctx = ctxFor(STRANGER);

  assert.equal(await pass(ctx), false);
  assert.deepEqual(ctx.replies, []);
});

test('ผู้ดูแลได้รับแจ้งพร้อมชื่อ chat_id และปุ่มอนุมัติ', () => {
  assert.equal(sent.length, 1);

  const [notification] = sent;
  assert.equal(notification.target, SUPER_ADMIN_ID);
  assert.match(notification.message, /มีผู้ใช้ใหม่ขอใช้งานบอท/);
  assert.match(notification.message, /ชื่อ: สมปอง ใจกล้า/);
  assert.match(notification.message, /username: @sompong/);
  assert.match(notification.message, new RegExp(`chat_id: ${STRANGER.id}`));

  const [button] = notification.extra.reply_markup.inline_keyboard[0];
  assert.equal(button.text, '✅ อนุมัติ สมปอง ใจกล้า');
  assert.equal(button.callback_data, `approve:${STRANGER.id}`);
});

test('ทักซ้ำอีกกี่ครั้งผู้ดูแลก็ไม่โดนแจ้งซ้ำ', async () => {
  sent = [];

  for (const text of ['ทักอีกที', 'ยังอยู่ไหม', 'ฮัลโหล']) {
    assert.equal(await pass(ctxFor(STRANGER, { text })), false);
  }

  assert.deepEqual(sent, []);
  assert.equal(isPending(STRANGER.id), true);
});

test('คนที่ยังไม่ได้รับอนุญาตใช้ /cl ก็ถูกปฏิเสธเหมือนกัน', async () => {
  sent = [];
  const ctx = ctxFor(STRANGER, { text: '/cl' });

  assert.equal(await pass(ctx), false);
  assert.deepEqual(ctx.replies, []);
  assert.deepEqual(sent, []);
});

test('/start ของคนแปลกหน้าก็ไม่ผ่านด่าน', async () => {
  const ctx = ctxFor(STRANGER, { text: '/start' });

  assert.equal(await pass(ctx), false);
  assert.deepEqual(ctx.replies, []);
});

test('ผู้ดูแลใช้บอทได้เสมอโดยไม่ต้องอนุมัติตัวเอง', async () => {
  const admin = { id: SUPER_ADMIN_ID, first_name: 'แอดมิน' };

  assert.equal(await pass(ctxFor(admin)), true);
  assert.equal(isApproved(SUPER_ADMIN_ID), false);
});

test('update ที่ไม่มีผู้ส่งถูกทิ้งไปเงียบๆ', async () => {
  const ctx = ctxFor(STRANGER);
  ctx.from = undefined;

  assert.equal(await pass(ctx), false);
});

test('กดปุ่มอนุมัติแล้วเข้ารายชื่อทันที และเจ้าตัวได้รับแจ้ง', async () => {
  sent = [];
  const edited = [];
  const answered = [];

  await fireAction(bot, `approve:${STRANGER.id}`, {
    from: { id: SUPER_ADMIN_ID },
    chat: { id: SUPER_ADMIN_ID },
    answerCbQuery: async (text) => answered.push(text),
    editMessageText: async (text) => edited.push(text),
    telegram: { sendMessage: async (target, message) => sent.push({ target, message }) },
  });

  assert.equal(isApproved(STRANGER.id), true);
  assert.equal(isPending(STRANGER.id), false);
  assert.deepEqual(answered, ['อนุมัติ สมปอง ใจกล้า แล้ว']);
  assert.match(edited[0], /อนุมัติ สมปอง ใจกล้า แล้ว/);

  const [welcome] = sent;
  assert.equal(welcome.target, String(STRANGER.id));
  assert.equal(welcome.message, accessControl.WELCOME_APPROVED);
});

test('รายชื่อที่บันทึกไว้มีชื่อและวันที่อนุมัติ', () => {
  const user = listApproved().find((entry) => entry.chatId === String(STRANGER.id));

  assert.equal(user.name, 'สมปอง ใจกล้า');
  assert.equal(user.username, 'sompong');
  assert.match(user.approvedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('พออนุมัติแล้วข้อความถัดไปถูกประมวลผลทันที', async () => {
  sent = [];
  const ctx = ctxFor(STRANGER, { text: 'สวัสดีอีกครั้ง' });

  assert.equal(await pass(ctx), true);
  assert.deepEqual(sent, []);
});

test('กดปุ่มอนุมัติซ้ำไม่ทำอะไรเพิ่ม', async () => {
  const answered = [];

  await fireAction(bot, `approve:${STRANGER.id}`, {
    from: { id: SUPER_ADMIN_ID },
    answerCbQuery: async (text) => answered.push(text),
    editMessageText: async () => {
      throw new Error('ไม่ควรถูกเรียก');
    },
    telegram: { sendMessage: async () => {} },
  });

  assert.deepEqual(answered, ['อนุมัติไปแล้ว']);
});

test('ผู้ใช้ทั่วไปยิงปุ่มอนุมัติเองไม่ได้', async () => {
  const answered = [];
  const outsider = { id: 777888, first_name: 'คนอื่น' };

  await fireAction(bot, 'approve:123456', {
    from: outsider,
    answerCbQuery: async (text) => answered.push(text),
    editMessageText: async () => {
      throw new Error('ไม่ควรถูกเรียก');
    },
    telegram: { sendMessage: async () => {} },
  });

  assert.deepEqual(answered, ['เฉพาะผู้ดูแลระบบเท่านั้น']);
  assert.equal(isApproved('123456'), false);
});
