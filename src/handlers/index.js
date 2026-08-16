'use strict';

const start = require('./start');
const languageSelect = require('./language-select');
const translate = require('./translate');

// ลำดับสำคัญ: language-select ทำหน้าที่เป็นด่านตรวจภาษาปลายทาง
// ก่อนปล่อยข้อความเสียงต่อให้ translate
const handlers = [start, languageSelect, translate];

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
