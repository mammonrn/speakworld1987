'use strict';

const { TARGET_LANGUAGES, languageName } = require('../languages');

// อ่านรายชื่อจากตารางภาษาโดยตรง เพิ่มภาษาใหม่แล้วข้อความต้อนรับตามทันเอง
const LANGUAGE_LIST = TARGET_LANGUAGES.map((lang) => languageName(lang.code)).join(' / ');

const WELCOME_MESSAGE = [
  'สวัสดีครับ 👋 ยินดีต้อนรับสู่ SpeakWorld',
  '',
  'ผมเป็นล่ามเสียงให้คุณครับ วิธีใช้:',
  '• ส่งข้อความเสียงภาษาไทยเข้ามา ผมจะแปลให้เป็นภาษาที่คุณเลือก',
  '• ถ้าอีกฝ่ายตอบกลับมา (พิมพ์หรือส่งเสียง) ผมจะแปลกลับเป็นไทยให้อัตโนมัติ',
  '',
  'คำสั่งที่ใช้ได้:',
  '• /start — แสดงข้อความนี้',
  `• /cl — เปลี่ยนภาษาปลายทาง (${LANGUAGE_LIST})`,
  '',
  'ส่งข้อความเสียงมาได้เลย ครั้งแรกผมจะถามก่อนว่าจะแปลเป็นภาษาอะไร',
].join('\n');

/**
 * ลงทะเบียนคำสั่ง /start
 * @param {import('telegraf').Telegraf} bot
 */
function register(bot) {
  bot.start((ctx) => ctx.reply(WELCOME_MESSAGE));
}

module.exports = { register, WELCOME_MESSAGE };
