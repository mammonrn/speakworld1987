'use strict';

const path = require('path');

const { dataDir } = require('../config');
const { readJson, createWriter } = require('./json-file');

const STORE_FILE = path.join(dataDir, 'approved-users.json');

/**
 * โครงข้อมูลในไฟล์
 *
 * - approved: คนที่ผู้ดูแลกดอนุมัติแล้ว ใช้บอทได้
 * - pending:  คนที่เคยทักเข้ามาแต่ยังไม่ได้อนุมัติ เก็บไว้สองเรื่อง คือกันแจ้งเตือนซ้ำ
 *             ทุกข้อความ และจำชื่อไว้ให้ปุ่มอนุมัติใช้ตอนกด (callback data ใส่ได้แค่ id)
 *
 * รูปแบบ: { approved: { "<chatId>": {...} }, pending: { "<chatId>": {...} } }
 */
const EMPTY = { approved: {}, pending: {} };

const stored = readJson(STORE_FILE, EMPTY);
const users = {
  approved: stored.approved && typeof stored.approved === 'object' ? stored.approved : {},
  pending: stored.pending && typeof stored.pending === 'object' ? stored.pending : {},
};

const write = createWriter(STORE_FILE);

function persist() {
  return write(users).catch((err) => {
    console.error(`บันทึก ${STORE_FILE} ไม่สำเร็จ:`, err.message);
  });
}

/**
 * แชทนี้ได้รับอนุมัติแล้วหรือยัง
 * @param {number|string} chatId
 * @returns {boolean}
 */
function isApproved(chatId) {
  return Object.prototype.hasOwnProperty.call(users.approved, String(chatId));
}

/**
 * เคยแจ้งผู้ดูแลเรื่องแชทนี้ไปแล้วหรือยัง
 * @param {number|string} chatId
 * @returns {boolean}
 */
function isPending(chatId) {
  return Object.prototype.hasOwnProperty.call(users.pending, String(chatId));
}

/**
 * รายชื่อผู้ใช้ที่อนุมัติแล้ว เรียงตามวันที่อนุมัติจากเก่าไปใหม่
 * @returns {Array<{ chatId: string, name: string, username?: string, approvedAt: string }>}
 */
function listApproved() {
  return Object.entries(users.approved)
    .map(([chatId, info]) => ({ chatId, ...info }))
    .sort((a, b) => String(a.approvedAt).localeCompare(String(b.approvedAt)));
}

/**
 * ข้อมูลของคนที่รออนุมัติอยู่ (undefined = ไม่เคยทักมา หรือทักมาก่อนบอทรีสตาร์ท)
 * @param {number|string} chatId
 */
function getPending(chatId) {
  return users.pending[String(chatId)];
}

/**
 * จดคนที่ทักเข้ามาครั้งแรกไว้ว่ารออนุมัติ
 *
 * คืน false เมื่อจดไว้อยู่แล้ว ฝั่งที่เรียกจะได้รู้ว่าไม่ต้องแจ้งผู้ดูแลซ้ำ
 *
 * @param {number|string} chatId
 * @param {{ name: string, username?: string }} info
 * @returns {boolean} จดใหม่จริงหรือไม่
 */
function addPending(chatId, info) {
  const key = String(chatId);
  if (users.pending[key]) return false;

  users.pending[key] = { ...info, requestedAt: new Date().toISOString() };
  persist();
  return true;
}

/**
 * อนุมัติผู้ใช้ ย้ายออกจากคิวรออนุมัติ
 *
 * ใช้ชื่อจากคิวเป็นหลัก เพราะปุ่มอนุมัติส่งกลับมาแค่ chat id
 *
 * @param {number|string} chatId
 * @param {{ name?: string, username?: string }} [info] ใช้เมื่อไม่มีข้อมูลในคิวแล้ว
 * @returns {{ chatId: string, name: string, username?: string, approvedAt: string }}
 */
async function approve(chatId, info = {}) {
  const key = String(chatId);
  const pending = users.pending[key] || {};

  const entry = {
    name: info.name || pending.name || `ผู้ใช้ ${key}`,
    username: info.username || pending.username,
    approvedAt: new Date().toISOString(),
  };

  users.approved[key] = entry;
  delete users.pending[key];
  await persist();

  return { chatId: key, ...entry };
}

/**
 * ถอนสิทธิ์ผู้ใช้
 * @param {number|string} chatId
 * @returns {Promise<boolean>} เคยอยู่ในรายชื่อจริงหรือไม่
 */
async function remove(chatId) {
  const key = String(chatId);
  if (!users.approved[key]) return false;

  delete users.approved[key];
  await persist();
  return true;
}

module.exports = {
  STORE_FILE,
  isApproved,
  isPending,
  listApproved,
  getPending,
  addPending,
  approve,
  remove,
};
