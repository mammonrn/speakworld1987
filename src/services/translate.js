'use strict';

const { findLanguage } = require('../languages');
const googleTranslate = require('./google-translate');
const openaiTranslate = require('./openai-translate');
const deepseekTranslate = require('./deepseek-translate');

/**
 * สาเหตุล้มแบบย่อ (ภาษาไทย) ไว้บอกผู้ใช้ — ไม่ใส่ key/ข้อความดิบจาก API
 * @param {unknown} err
 * @returns {string}
 */
function reasonOf(err) {
  const msg = String((err && err.message) || err || '');
  const code = (msg.split('ตอบกลับ ')[1] || '').slice(0, 3);
  if (code === '402' || /balance|credit|insufficient|quota/i.test(msg)) return 'เครดิตหมด';
  if (code === '401' || code === '403') return 'API key ใช้ไม่ได้';
  if (code === '429') return 'ติด rate limit';
  if (msg.includes('ไม่ได้ตั้งค่า')) return msg.replace('ไม่ได้ตั้งค่า ', 'ยังไม่ได้ตั้งค่า ');
  if (/timeout|aborted/i.test(msg)) return 'หมดเวลารอ';
  return code ? `HTTP ${code}` : 'ข้อผิดพลาดชั่วคราว';
}

/** OpenAI ก่อน ล้มแล้วตกไป DeepSeek (ถ้ามี key) ล้มทั้งคู่ให้โยนสาเหตุรวม */
const openaiWithFallback = {
  async translate(text, languages) {
    try {
      return await openaiTranslate.translate(text, languages);
    } catch (first) {
      console.error('OpenAI แปลไม่สำเร็จ ลอง DeepSeek:', reasonOf(first));
      if (!deepseekTranslate.hasKey()) throw first;
      try {
        return await deepseekTranslate.translate(text, languages);
      } catch (second) {
        const err = new Error(`OpenAI: ${reasonOf(first)}; DeepSeek: ${reasonOf(second)}`);
        err.reason = err.message;
        throw err;
      }
    }
  },
};

const PROVIDERS = {
  google: googleTranslate,
  openai: openaiWithFallback,
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
  reasonOf,
  translateText,
  translatorFor,
  providerNameFor,
  detectLanguage: googleTranslate.detectLanguage,
};
