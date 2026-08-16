'use strict';

const PLACEHOLDER_REPLY = 'ได้รับข้อความเสียงแล้ว (ยังไม่เปิดใช้งานการแปล)';

/**
 * ลงทะเบียน handler สำหรับข้อความเสียง
 *
 * ตอนนี้เป็น placeholder เท่านั้น — ขั้นถัดไปคือดาวน์โหลดไฟล์เสียงจาก Telegram
 * ส่งเข้า STT แล้วส่งข้อความที่ถอดได้ต่อไปยัง handler แปลภาษา
 *
 * @param {import('telegraf').Telegraf} bot
 */
function register(bot) {
  bot.on('voice', (ctx) => ctx.reply(PLACEHOLDER_REPLY));
}

module.exports = { register, PLACEHOLDER_REPLY };
