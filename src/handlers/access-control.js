'use strict';

const { Markup } = require('telegraf');

const { superAdminId } = require('../config');
const { isSuperAdmin, displayName } = require('../users');
const {
  isApproved,
  isPending,
  addPending,
  getPending,
  approve,
} = require('../store/approved-users');

const APPROVE_PREFIX = 'approve';

const WELCOME_APPROVED = [
  'ผู้ดูแลอนุมัติให้คุณใช้งาน SpeakWorld แล้วครับ 🎉',
  '',
  'ส่งข้อความเสียงภาษาไทยเข้ามาได้เลย หรือพิมพ์ /start เพื่อดูวิธีใช้',
].join('\n');

/**
 * ข้อความแจ้งผู้ดูแลว่ามีคนใหม่ทักเข้ามา
 * @param {{ id: number, username?: string }} from
 * @param {number|string} chatId
 * @param {string} name
 */
function requestMessage(from, chatId, name) {
  const lines = [
    '🔔 มีผู้ใช้ใหม่ขอใช้งานบอท',
    '',
    `ชื่อ: ${name}`,
  ];

  if (from.username) lines.push(`username: @${from.username}`);
  lines.push(`chat_id: ${chatId}`);
  lines.push('', 'ถ้าไม่กดอนุมัติ บอทจะเงียบกับคนนี้ต่อไป');

  return lines.join('\n');
}

/** ปุ่มอนุมัติที่แนบไปกับข้อความแจ้งเตือน */
function approveKeyboard(chatId, name) {
  return Markup.inlineKeyboard([
    Markup.button.callback(`✅ อนุมัติ ${name}`, `${APPROVE_PREFIX}:${chatId}`),
  ]);
}

/**
 * แจ้งผู้ดูแลว่ามีคนขอใช้งาน — ครั้งเดียวต่อหนึ่งคน
 *
 * ตัวกันแจ้งซ้ำคือคิว pending ในไฟล์ ไม่ใช่ตัวแปรในหน่วยความจำ ผู้ใช้ที่ถูกจด
 * ไว้แล้วจะไม่ทำให้ผู้ดูแลโดนสแปมอีก แม้บอทจะรีสตาร์ทไปหลายรอบ
 *
 * @param {import('telegraf').Context} ctx
 * @param {number|string} chatId
 * @param {string} name
 */
async function requestAccess(ctx, chatId, name) {
  const isNew = addPending(chatId, { name, username: ctx.from.username });
  if (!isNew || !superAdminId) return;

  try {
    await ctx.telegram.sendMessage(
      superAdminId,
      requestMessage(ctx.from, chatId, name),
      approveKeyboard(chatId, name)
    );
  } catch (err) {
    console.error('แจ้งผู้ดูแลเรื่องผู้ใช้ใหม่ไม่สำเร็จ:', err.message);
  }
}

/**
 * ลงทะเบียนด่านตรวจสิทธิ์
 *
 * ต้องเป็นตัวแรกสุดของ chain — ทุก update วิ่งผ่านที่นี่ก่อน handler อื่นทั้งหมด
 * รวมถึง /start และ /cl ด้วย คนที่ยังไม่ได้รับอนุมัติจึงเรียกอะไรไม่ได้เลย
 * และจะไม่ได้รับข้อความตอบกลับใดๆ (เงียบสนิท) เพื่อไม่ให้บอทกลายเป็นช่องทาง
 * ให้คนนอกยิงข้อความใส่ API ที่เราจ่ายเงินเอง
 *
 * @param {import('telegraf').Telegraf} bot
 */
function register(bot) {
  bot.use(async (ctx, next) => {
    const from = ctx.from;
    // update ที่ไม่มีผู้ส่ง (เช่นโพสต์ในแชนแนล) ไม่ใช่บทสนทนาที่บอทนี้รองรับ
    if (!from) return;

    if (isSuperAdmin(from.id)) return next();

    const chatId = ctx.chat?.id ?? from.id;
    if (isApproved(chatId)) return next();

    await requestAccess(ctx, chatId, displayName(from));
  });

  bot.action(new RegExp(`^${APPROVE_PREFIX}:(.+)$`), async (ctx) => {
    // ถึงด่านบนจะกรองไว้แล้ว แต่ปุ่มนี้แก้สิทธิ์คนอื่นได้ จึงตรวจซ้ำอีกชั้น
    if (!isSuperAdmin(ctx.from?.id)) {
      await ctx.answerCbQuery('เฉพาะผู้ดูแลระบบเท่านั้น');
      return;
    }

    const chatId = ctx.match[1];

    if (isApproved(chatId)) {
      await ctx.answerCbQuery('อนุมัติไปแล้ว');
      return;
    }

    const pending = getPending(chatId);
    const user = await approve(chatId);

    await ctx.answerCbQuery(`อนุมัติ ${user.name} แล้ว`);
    await ctx.editMessageText(
      `✅ อนุมัติ ${user.name} แล้ว (chat_id: ${chatId})\nตอนนี้ใช้บอทได้ทันที`
    );

    // บอกเจ้าตัวด้วย ไม่งั้นเขาจะไม่รู้ว่าทักซ้ำได้แล้ว
    try {
      await ctx.telegram.sendMessage(chatId, WELCOME_APPROVED);
    } catch (err) {
      console.error(`แจ้งผู้ใช้ ${chatId} ว่าได้รับอนุมัติไม่สำเร็จ:`, err.message);
    }

    console.log(
      `[ผู้ดูแล] อนุมัติ ${user.name} (chat ${chatId})` +
        `${pending ? '' : ' — ไม่พบข้อมูลในคิว ใช้ชื่อสำรอง'}`
    );
  });
}

module.exports = {
  register,
  requestMessage,
  approveKeyboard,
  APPROVE_PREFIX,
  WELCOME_APPROVED,
  isPending,
};
