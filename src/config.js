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

// สองตัวนี้ไม่บังคับตอนบูต บอทยังตอบ /start และรับข้อความได้
// แต่ถ้าไม่มี ฟีเจอร์แปลจะตอบว่าเกิดข้อผิดพลาด จึงเตือนไว้ตั้งแต่ตอนเริ่ม
const openaiApiKey = process.env.OPENAI_API_KEY;
const googleTranslateApiKey = process.env.GOOGLE_TRANSLATE_API_KEY;

if (!openaiApiKey) {
  console.warn('คำเตือน: ไม่พบ OPENAI_API_KEY — การถอดเสียงจะใช้งานไม่ได้');
}

if (!googleTranslateApiKey) {
  console.warn('คำเตือน: ไม่พบ GOOGLE_TRANSLATE_API_KEY — การแปลภาษาจะใช้งานไม่ได้');
}

module.exports = {
  token,
  openaiApiKey,
  googleTranslateApiKey,
};
