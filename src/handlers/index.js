'use strict';

const accessControl = require('./access-control');
const start = require('./start');
const admin = require('./admin');
const reaction = require('./reaction');
const languageSelect = require('./language-select');
const translate = require('./translate');

// ลำดับสำคัญ:
// - access-control ต้องเป็นตัวแรกสุด เป็นด่านตรวจสิทธิ์ของทุก update
// - reaction ต้องมาก่อน handler ที่ทำงานหนัก เพื่อให้ ❤ ขึ้นทันทีที่ได้รับเสียง
// - language-select เป็นด่านตรวจภาษาปลายทาง ก่อนปล่อยต่อให้ translate
const handlers = [accessControl, start, admin, reaction, languageSelect, translate];

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
