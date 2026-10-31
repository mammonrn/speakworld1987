'use strict';

/**
 * เมนูคำสั่งของบอท (setMyCommands) ที่ Telegram แสดงเป็นปุ่ม Menu ข้างช่องพิมพ์
 *
 * ต้องตรงกับคำสั่งที่บอทรองรับจริง — test/menu.test.js ตรวจเทียบซอร์ส handler ให้
 * ปุ่มของผู้ดูแล (อนุมัติ/ถอนสิทธิ์/ค่าใช้จ่าย) ใช้ปุ่ม inline ไม่มีคำสั่งพิมพ์ จึงไม่มีเมนูเฉพาะแอดมิน
 * คำอธิบายสั้นไม่เกิน 40 ตัวอักษร
 */
const { findLanguage } = require('./languages');
const { QUICK_LANGUAGE_COMMANDS } = require('./handlers/language-select');

/** คำอธิบายเมนูภาษา = ธงชาติ + ชื่อภาษาไทย (ตัดมาจาก label ในตาราง TARGET_LANGUAGES) */
const LANGUAGE_MENU = QUICK_LANGUAGE_COMMANDS.map(({ command, code }) => ({
  command,
  description: findLanguage(code).label,
}));

const BOT_COMMANDS = [
  ...LANGUAGE_MENU,
  { command: 'cl', description: 'เลือกภาษาด้วยปุ่ม' },
  { command: 'start', description: 'วิธีใช้บอท' },
];

/**
 * ลงทะเบียนเมนูตอนบอทเริ่ม · พลาดแค่ log ห้ามล้มบอท
 * @param {import('telegraf').Telegram} telegram
 * @returns {Promise<boolean>}
 */
async function registerMenu(telegram) {
  try {
    await telegram.setMyCommands(BOT_COMMANDS);
    await telegram.setChatMenuButton({ menuButton: { type: 'commands' } });
    return true;
  } catch (err) {
    console.error('ตั้งเมนูคำสั่งไม่สำเร็จ:', err && err.message ? err.message : err);
    return false;
  }
}

module.exports = { BOT_COMMANDS, registerMenu };
