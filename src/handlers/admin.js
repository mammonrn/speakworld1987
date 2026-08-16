'use strict';

const { Markup } = require('telegraf');

const { isSuperAdmin } = require('../users');
const { listApproved, remove } = require('../store/approved-users');
const { monthlyUsage } = require('../services/usage-tracker');

const PREFIX = 'admin';

const MENU_LABELS = {
  users: '👥 จัดการ user',
  cost: '📊 เช็คค่าใช้จ่ายเดือนนี้',
};

const NO_USERS = 'ยังไม่มีผู้ใช้ที่อนุมัติไว้';

/** ปุ่มเมนูผู้ดูแล แนบไปกับ /start เฉพาะผู้ดูแลเท่านั้น */
function adminKeyboard() {
  return Markup.inlineKeyboard(
    [
      Markup.button.callback(MENU_LABELS.users, `${PREFIX}:users`),
      Markup.button.callback(MENU_LABELS.cost, `${PREFIX}:cost`),
    ],
    { columns: 1 }
  );
}

/** รายชื่อผู้ใช้ กดชื่อไหนคือจะถอนสิทธิ์คนนั้น */
function userListKeyboard(users) {
  return Markup.inlineKeyboard(
    users.map((user) =>
      Markup.button.callback(`🗑 ${user.name}`, `${PREFIX}:remove:${user.chatId}`)
    ),
    { columns: 1 }
  );
}

/** ด่านยืนยันก่อนถอนสิทธิ์จริง กันนิ้วลั่น */
function confirmKeyboard(chatId) {
  return Markup.inlineKeyboard(
    [
      Markup.button.callback('⚠️ ยืนยันลบ', `${PREFIX}:remove-confirm:${chatId}`),
      Markup.button.callback('↩️ ยกเลิก', `${PREFIX}:users`),
    ],
    { columns: 2 }
  );
}

/** วินาที → "X นาที Y วิ" อ่านง่ายกว่าวินาทีล้วนเมื่อยอดสะสมทั้งเดือน */
function formatDuration(seconds) {
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  return minutes ? `${minutes} นาที ${total % 60} วิ` : `${total} วิ`;
}

function formatUsd(amount) {
  return `$${amount.toFixed(4)}`;
}

/**
 * รายงานค่าใช้จ่ายเดือนปัจจุบัน เรียงจากคนที่ใช้หนักที่สุด
 * @returns {string}
 */
function costReport() {
  const usage = monthlyUsage();

  if (!usage.entries.length) {
    return `📊 เดือน ${usage.month}\n\nยังไม่มีการใช้งานในเดือนนี้`;
  }

  const lines = [`📊 ค่าใช้จ่ายโดยประมาณ เดือน ${usage.month}`, ''];

  usage.entries.forEach((entry, index) => {
    const characters = Object.entries(entry.translation)
      .map(([provider, count]) => `${provider} ${count.toLocaleString('en-US')} ตัวอักษร`)
      .join(' · ');

    lines.push(`${index + 1}. ${entry.name || `chat ${entry.chatId}`} (${entry.chatId})`);
    lines.push(`   เสียง ${formatDuration(entry.speechSeconds)}`);
    if (characters) lines.push(`   แปล ${characters}`);
    lines.push(`   ≈ ${formatUsd(entry.cost)}`);
    lines.push('');
  });

  lines.push(`รวมทั้งหมด ≈ ${formatUsd(usage.total)} ${usage.currency}`);
  lines.push('');
  lines.push('ตัวเลขนี้เป็นการประมาณจากราคาป้าย ไม่ได้หัก free tier และไม่ใช่ยอดบิลจริง');

  return lines.join('\n');
}

/**
 * แสดง/แก้ข้อความเป็นรายชื่อผู้ใช้
 * @param {import('telegraf').Context} ctx
 */
async function showUserList(ctx) {
  const users = listApproved();

  if (!users.length) {
    await ctx.editMessageText(NO_USERS);
    return;
  }

  await ctx.editMessageText(
    `👥 ผู้ใช้ที่อนุมัติแล้ว ${users.length} คน\nกดชื่อเพื่อถอนสิทธิ์`,
    userListKeyboard(users)
  );
}

/**
 * ลงทะเบียนเมนูผู้ดูแล
 *
 * ทุก action ตรวจสิทธิ์ซ้ำเอง ไม่พึ่งด่าน access-control อย่างเดียว เพราะด่านนั้น
 * ปล่อยผู้ใช้ที่อนุมัติแล้วทุกคนผ่าน — ซึ่งยิง callback data เองได้ถ้าอยากลอง
 *
 * @param {import('telegraf').Telegraf} bot
 */
function register(bot) {
  const adminOnly = (handler) => async (ctx) => {
    if (!isSuperAdmin(ctx.from?.id)) {
      await ctx.answerCbQuery('เฉพาะผู้ดูแลระบบเท่านั้น');
      return;
    }
    return handler(ctx);
  };

  bot.action(
    `${PREFIX}:users`,
    adminOnly(async (ctx) => {
      await ctx.answerCbQuery();
      await showUserList(ctx);
    })
  );

  bot.action(
    `${PREFIX}:cost`,
    adminOnly(async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.reply(costReport());
    })
  );

  bot.action(
    new RegExp(`^${PREFIX}:remove:(.+)$`),
    adminOnly(async (ctx) => {
      const chatId = ctx.match[1];
      const user = listApproved().find((entry) => entry.chatId === chatId);

      if (!user) {
        await ctx.answerCbQuery('ไม่พบผู้ใช้คนนี้แล้ว');
        await showUserList(ctx);
        return;
      }

      await ctx.answerCbQuery();
      await ctx.editMessageText(
        `ยืนยันถอนสิทธิ์ ${user.name} (${chatId}) ใช่ไหม\n` +
          'คนนี้จะใช้บอทไม่ได้ทันที และต้องอนุมัติใหม่ถ้าจะให้กลับมาใช้',
        confirmKeyboard(chatId)
      );
    })
  );

  bot.action(
    new RegExp(`^${PREFIX}:remove-confirm:(.+)$`),
    adminOnly(async (ctx) => {
      const chatId = ctx.match[1];
      const user = listApproved().find((entry) => entry.chatId === chatId);
      const removed = await remove(chatId);

      await ctx.answerCbQuery(removed ? `ถอนสิทธิ์ ${user?.name || chatId} แล้ว` : 'ไม่พบผู้ใช้');
      console.log(`[ผู้ดูแล] ถอนสิทธิ์ ${user?.name || 'ไม่ทราบชื่อ'} (chat ${chatId})`);

      await showUserList(ctx);
    })
  );
}

module.exports = {
  register,
  adminKeyboard,
  costReport,
  formatDuration,
  MENU_LABELS,
  NO_USERS,
  PREFIX,
};
