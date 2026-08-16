'use strict';

const { pinyin } = require('pinyin');

const { isSameLanguage } = require('../languages');

/** ภาษาที่ต้องกำกับคำอ่าน — จีนเท่านั้น ที่เหลืออ่านออกเสียงจากตัวเขียนได้อยู่แล้ว */
const ANNOTATED_LANGUAGE = 'zh-CN';

/** ตัวอักษรจีน ใช้เช็คว่าข้อความมีอะไรให้ถอดเสียงจริงไหม */
const HAN = /\p{Script=Han}/u;

/**
 * เครื่องหมายวรรคตอนเต็มความกว้างของจีน → แบบครึ่งความกว้าง
 * บรรทัดพินอินเป็นอักษรละติน ใช้เครื่องหมายแบบละตินจะอ่านลื่นกว่า
 */
const PUNCTUATION = {
  '，': ',',
  '、': ',',
  '。': '.',
  '？': '?',
  '！': '!',
  '：': ':',
  '；': ';',
  '（': '(',
  '）': ')',
  '【': '[',
  '】': ']',
  '《': '"',
  '》': '"',
  '“': '"',
  '”': '"',
  '‘': "'",
  '’': "'",
  '—': '-',
  '…': '...',
};

function normalizePunctuation(text) {
  return text.replace(/[，、。？！：；（）【】《》“”‘’—…]/g, (char) => PUNCTUATION[char]);
}

/** ขึ้นต้นประโยคด้วยตัวพิมพ์ใหญ่ ข้ามวงเล็บหรือเครื่องหมายที่นำหน้าอยู่ */
function capitalize(text) {
  return text.replace(/^([^\p{L}]*)(\p{L})/u, (_match, lead, letter) => lead + letter.toUpperCase());
}

/**
 * แปลงข้อความจีนเป็นพินอินพร้อมวรรณยุกต์
 *
 * pinyin คืนผลเป็นอาร์เรย์ทีละพยางค์ ส่วนที่ไม่ใช่อักษรจีน (ตัวเลข คำภาษาอังกฤษ
 * เครื่องหมายวรรคตอน) ถูกส่งผ่านมาเป็นก้อนตามเดิม จึงต้องต่อกลับเองแล้วเก็บกวาด
 * ช่องว่างอีกที ไม่งั้นจะได้ "nǐ hǎo ma ?" ที่มีช่องว่างลอยหน้าเครื่องหมาย
 *
 * @param {string} text ข้อความภาษาจีน
 * @returns {string} พินอิน ('' เมื่อไม่มีอักษรจีนให้ถอด)
 */
function toPinyin(text) {
  if (!text || !HAN.test(text)) return '';

  const syllables = pinyin(text, { style: 'tone' }).map((candidates) => candidates[0]);

  const joined = normalizePunctuation(syllables.join(' '))
    // ไม่ต้องเว้นวรรคหน้าเครื่องหมายปิดท้าย
    .replace(/\s+([,.?!:;)\]}%])/g, '$1')
    // และไม่ต้องเว้นวรรคหลังเครื่องหมายเปิด
    .replace(/([([{])\s+/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return capitalize(joined);
}

/**
 * ต่อท้ายคำแปลด้วยพินอินในวงเล็บ เมื่อปลายทางเป็นภาษาจีน
 *
 * ใช้เฉพาะทิศทางไทย → จีน ขากลับจีน → ไทยไม่ต้องกำกับ เพราะผู้ใช้คนไทย
 * อ่านผลลัพธ์ภาษาไทยได้อยู่แล้ว
 *
 * @param {string} text ข้อความที่แปลเสร็จแล้ว
 * @param {string} target รหัสภาษาปลายทางของการแปลครั้งนั้น
 * @returns {string} ข้อความเดิม หรือข้อความ + " (พินอิน)"
 */
function annotate(text, target) {
  if (!isSameLanguage(target, ANNOTATED_LANGUAGE)) return text;

  const reading = toPinyin(text);
  // ไม่เว้นวรรคก่อนวงเล็บ เพราะเครื่องหมายจีนกินที่ว่างท้ายประโยคมาให้แล้ว
  return reading ? `${text}(${reading})` : text;
}

module.exports = { annotate, toPinyin, ANNOTATED_LANGUAGE };
