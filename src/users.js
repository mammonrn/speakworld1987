'use strict';

const { superAdminId } = require('./config');

/**
 * ผู้ใช้คนนี้เป็นผู้ดูแลระบบหรือไม่
 *
 * เทียบกับ Telegram ID ของ "ผู้ส่ง" ไม่ใช่ id ของแชท เพราะผู้ดูแลอาจทักมาจาก
 * ในกลุ่มซึ่ง chat id เป็นคนละค่ากับ id ส่วนตัว
 *
 * @param {number|string} userId
 * @returns {boolean}
 */
function isSuperAdmin(userId) {
  return Boolean(superAdminId) && Number(userId) === superAdminId;
}

/**
 * ชื่อที่เอาไว้แสดงในรายชื่อผู้ใช้และข้อความแจ้งเตือน
 *
 * Telegram ไม่รับประกันว่ามีทั้งนามสกุลและ username จึงไล่ลงมาทีละชั้น
 * จนเหลือ id เปล่าๆ เป็นทางสุดท้าย
 *
 * @param {{ id?: number, first_name?: string, last_name?: string, username?: string }} from
 * @returns {string}
 */
function displayName(from) {
  if (!from) return 'ไม่ทราบชื่อ';

  const fullName = [from.first_name, from.last_name].filter(Boolean).join(' ').trim();
  if (fullName) return fullName;
  if (from.username) return `@${from.username}`;

  return `ผู้ใช้ ${from.id}`;
}

module.exports = { isSuperAdmin, displayName };
