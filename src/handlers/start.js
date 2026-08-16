'use strict';

const WELCOME_MESSAGE = [
  'สวัสดีครับ 👋 ยินดีต้อนรับสู่ SpeakWorld',
  '',
  'ตอนนี้บอทยังอยู่ในขั้นเริ่มต้น รองรับเพียง:',
  '• /start — แสดงข้อความทักทายนี้',
  '• ส่งข้อความเสียง — บอทจะตอบรับว่าได้รับแล้ว',
  '',
  'เป้าหมายถัดไปคือการถอดเสียงและแปลภาษาอัตโนมัติ',
].join('\n');

/**
 * ลงทะเบียนคำสั่ง /start
 * @param {import('telegraf').Telegraf} bot
 */
function register(bot) {
  bot.start((ctx) => ctx.reply(WELCOME_MESSAGE));
}

module.exports = { register, WELCOME_MESSAGE };
