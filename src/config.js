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
//
// googleApiKey ใช้กับสองบริการที่อยู่ใต้โปรเจกต์ Google Cloud เดียวกัน
// คือ Speech-to-Text (ถอดเสียง) และ Translation v2 (แปลคาซัค/พม่า + ตรวจภาษา)
const googleApiKey = process.env.GOOGLE_API_KEY;
// openaiApiKey ใช้แปลจีน/อังกฤษเท่านั้น ไม่ได้ใช้ถอดเสียงแล้ว
const openaiApiKey = process.env.OPENAI_API_KEY;

if (!googleApiKey) {
  console.warn('คำเตือน: ไม่พบ GOOGLE_API_KEY — การถอดเสียงและการแปลคาซัค/พม่าจะใช้งานไม่ได้');
}

if (!openaiApiKey) {
  console.warn('คำเตือน: ไม่พบ OPENAI_API_KEY — การแปลจีน/อังกฤษจะใช้งานไม่ได้');
}

module.exports = {
  token,
  googleApiKey,
  openaiApiKey,
};
