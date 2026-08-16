'use strict';

const start = require('./start');
const reaction = require('./reaction');
const languageSelect = require('./language-select');
const translate = require('./translate');

// ลำดับสำคัญ:
// - reaction ต้องมาก่อนใคร เพื่อให้ ❤ ขึ้นทันทีที่ได้รับเสียง
// - language-select เป็นด่านตรวจภาษาปลายทาง ก่อนปล่อยต่อให้ translate
const handlers = [start, reaction, languageSelect, translate];

/**
 * ลงทะเบียน handler ทั้งหมดเข้ากับ bot
 * @param {import('telegraf').Telegraf} bot
 */
function registerHandlers(bot) {
  for (const handler of handlers) {
    handler.register(bot);
  }
}

module.exports = { registerHandlers };
