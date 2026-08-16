'use strict';

const { TARGET_LANGUAGES, languageName } = require('../languages');
const { isSuperAdmin } = require('../users');
const { adminKeyboard } = require('./admin');

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
 *
 * ผู้ดูแลระบบได้ปุ่มจัดการผู้ใช้และดูค่าใช้จ่ายแนบมากับข้อความต้อนรับด้วย
 * ผู้ใช้ทั่วไปเห็นแค่ข้อความเปล่า — และคนที่ยังไม่ได้รับอนุมัติมาไม่ถึงตรงนี้เลย
 * เพราะถูกด่าน access-control กันไว้ก่อนแล้ว
 *
 * @param {import('telegraf').Telegraf} bot
 */
function register(bot) {
  bot.start((ctx) =>
    isSuperAdmin(ctx.from?.id)
      ? ctx.reply(WELCOME_MESSAGE, adminKeyboard())
      : ctx.reply(WELCOME_MESSAGE)
  );
}

module.exports = { register, WELCOME_MESSAGE };
