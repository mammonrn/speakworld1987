'use strict';

const start = require('./start');
const voice = require('./voice');

// handler ที่ยังไม่ได้พัฒนา (language-select, translate)
// จะถูกเพิ่มเข้ามาในลิสต์นี้เมื่อพร้อมใช้งาน
const handlers = [start, voice];

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
