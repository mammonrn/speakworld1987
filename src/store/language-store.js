'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const STORE_FILE = path.join(DATA_DIR, 'user-languages.json');

/**
 * แคชในหน่วยความจำ อ่านจากไฟล์ครั้งเดียวตอนเริ่มทำงาน
 * รูปแบบ: { "<chatId>": "<languageCode>" }
 * @type {Record<string, string>}
 */
let languages = load();

/** ต่อคิวการเขียนเพื่อไม่ให้เขียนไฟล์ทับกันเมื่อมีหลายแชทพร้อมกัน */
let writeQueue = Promise.resolve();

function load() {
  try {
    const raw = fs.readFileSync(STORE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
    console.warn(`รูปแบบข้อมูลใน ${STORE_FILE} ไม่ถูกต้อง เริ่มต้นใหม่เป็นค่าว่าง`);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`อ่าน ${STORE_FILE} ไม่สำเร็จ เริ่มต้นใหม่เป็นค่าว่าง:`, err.message);
    }
  }
  return {};
}

async function persist() {
  const snapshot = JSON.stringify(languages, null, 2);
  // เขียนลงไฟล์ชั่วคราวก่อนแล้วค่อย rename กันไฟล์พังหากโปรเซสถูกฆ่ากลางคัน
  const tmpFile = `${STORE_FILE}.${process.pid}.tmp`;
  await fsp.mkdir(DATA_DIR, { recursive: true });
  await fsp.writeFile(tmpFile, `${snapshot}\n`, 'utf8');
  await fsp.rename(tmpFile, STORE_FILE);
}

/**
 * ภาษาปลายทางที่แชทนี้เลือกไว้ (undefined = ยังไม่เคยเลือก)
 * @param {number|string} chatId
 * @returns {string | undefined}
 */
function getLanguage(chatId) {
  return languages[String(chatId)];
}

/**
 * บันทึกภาษาปลายทางของแชท
 * @param {number|string} chatId
 * @param {string} languageCode
 */
async function setLanguage(chatId, languageCode) {
  languages[String(chatId)] = languageCode;
  writeQueue = writeQueue.then(persist, persist);
  await writeQueue;
}

module.exports = {
  STORE_FILE,
  getLanguage,
  setLanguage,
};
