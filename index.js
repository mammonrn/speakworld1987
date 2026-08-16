'use strict';

const { Telegraf } = require('telegraf');

const { token } = require('./src/config');
const { registerHandlers } = require('./src/handlers');

const bot = new Telegraf(token);

registerHandlers(bot);

bot.catch((err, ctx) => {
  console.error(`เกิดข้อผิดพลาดขณะประมวลผล update ${ctx.update.update_id}:`, err);
});

bot
  .launch(() => console.log('บอทเริ่มทำงานแล้ว (long polling)'))
  .catch((err) => {
    console.error('เริ่มบอทไม่สำเร็จ:', err);
    process.exit(1);
  });

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
