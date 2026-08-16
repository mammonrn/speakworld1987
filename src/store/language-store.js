'use strict';

const path = require('path');

const { dataDir } = require('../config');
const { readJson, createWriter } = require('./json-file');

const STORE_FILE = path.join(dataDir, 'user-languages.json');

/**
 * แคชในหน่วยความจำ อ่านจากไฟล์ครั้งเดียวตอนเริ่มทำงาน
 * รูปแบบ: { "<chatId>": "<languageCode>" }
 * @type {Record<string, string>}
 */
const languages = readJson(STORE_FILE, {});

const write = createWriter(STORE_FILE);

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
  await write(languages);
}

module.exports = {
  STORE_FILE,
  getLanguage,
  setLanguage,
};
