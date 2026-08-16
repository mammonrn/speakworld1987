'use strict';

const { findLanguage } = require('../languages');
const googleTranslate = require('./google-translate');
const openaiTranslate = require('./openai-translate');

const PROVIDERS = {
  google: googleTranslate,
  openai: openaiTranslate,
};

const DEFAULT_PROVIDER = 'google';

/**
 * ผู้ให้บริการแปลของแชทนี้
 *
 * เลือกจาก "ภาษาปลายทางที่แชทตั้งไว้" ไม่ใช่ปลายทางของคำขอแต่ละครั้ง เพื่อให้
 * ขาไปและขากลับของบทสนทนาเดียวกันผ่านผู้ให้บริการเดียวกันเสมอ — สำนวนที่ได้
 * จะได้ไม่กระโดดไปมาระหว่างสองเจ้าในแชทเดียว
 *
 * @param {string} chatLanguage ภาษาปลายทางของแชท เช่น 'zh-CN'
 * @returns {{ translate: (text: string, languages: { source: string, target: string }) => Promise<string> }}
 */
function translatorFor(chatLanguage) {
  const provider = findLanguage(chatLanguage)?.provider || DEFAULT_PROVIDER;
  return PROVIDERS[provider] || PROVIDERS[DEFAULT_PROVIDER];
}

/**
 * ชื่อผู้ให้บริการแปลของแชทนี้ ใช้เขียน log
 * @param {string} chatLanguage
 * @returns {string}
 */
function providerNameFor(chatLanguage) {
  return findLanguage(chatLanguage)?.provider || DEFAULT_PROVIDER;
}

/**
 * แปลข้อความโดยส่งต่อให้ผู้ให้บริการของแชทนั้น
 *
 * ต้องระบุ source เสมอ เพราะรู้ภาษาต้นทางแน่นอนก่อนเรียกอยู่แล้ว — ขาเสียงได้
 * มาจาก Speech-to-Text ส่วนขาข้อความพิมพ์ได้มาจาก detectLanguage()
 *
 * @param {string} text
 * @param {{ source: string, target: string, via: string }} options
 *   via = ภาษาปลายทางของแชท ใช้เลือกผู้ให้บริการ
 * @returns {Promise<string>} ข้อความที่แปลแล้ว
 */
function translateText(text, { source, target, via }) {
  return translatorFor(via).translate(text, { source, target });
}

module.exports = {
  translateText,
  translatorFor,
  providerNameFor,
  detectLanguage: googleTranslate.detectLanguage,
};
