'use strict';

require('dotenv').config();

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error(
    'ไม่พบ TELEGRAM_BOT_TOKEN\n' +
      'กรุณาคัดลอก .env.example เป็น .env แล้วใส่ token ที่ได้จาก @BotFather'
  );
  process.exit(1);
}

module.exports = {
  token,
};
