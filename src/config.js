'use strict';

const path = require('path');

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

/**
 * Telegram ID ของผู้ดูแลระบบ — คนเดียวที่อนุมัติผู้ใช้และดูรายงานค่าใช้จ่ายได้
 *
 * ถ้าไม่ตั้งค่าไว้ จะไม่มีใครอนุมัติใครได้เลย บอทก็จะเงียบกับทุกคน
 * จึงเตือนให้ชัดตั้งแต่ตอนบูตว่าบอทใช้งานไม่ได้ทั้งตัว ไม่ใช่แค่บางฟีเจอร์
 */
const superAdminId = Number(process.env.SUPER_ADMIN_ID) || null;

if (!superAdminId) {
  console.warn(
    'คำเตือน: ไม่พบ SUPER_ADMIN_ID — จะไม่มีใครอนุมัติผู้ใช้ได้ บอทจะไม่ตอบใครเลย'
  );
}

/** ที่เก็บไฟล์ข้อมูลระหว่างรัน ตั้ง DATA_DIR ทับได้เวลาย้ายที่เก็บหรือตอนทดสอบ */
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

module.exports = {
  token,
  googleApiKey,
  openaiApiKey,
  superAdminId,
  dataDir,
};
