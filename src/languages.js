'use strict';

/** ภาษาต้นทางที่บอทคาดหวังจากผู้ใช้ */
const SOURCE_LANGUAGE = 'th';

/** รหัส BCP-47 ของภาษาไทยสำหรับ Google Speech-to-Text */
const SOURCE_SPEECH_CODE = 'th-TH';

/** ชื่อภาษาอังกฤษของภาษาไทย ใช้เขียน prompt ให้ OpenAI */
const SOURCE_ENGLISH_NAME = 'Thai';

/**
 * ภาษาปลายทางที่รองรับ
 *
 * - code        รหัสภาษาของ Google Cloud Translation v2 และเป็นคีย์ที่เก็บลง store
 * - speechCode  รหัส BCP-47 ของ Google Speech-to-Text ซึ่งละเอียดกว่า code
 *               (จีนกลางตัวย่อคือ 'cmn-Hans-CN' ไม่ใช่ 'zh-CN')
 * - englishName ชื่อภาษาที่เขียนลง prompt ของ OpenAI
 * - provider    ผู้ให้บริการแปลของภาษานี้ ใช้ทั้งขาไปและขากลับ
 *               คาซัค/พม่าใช้ Google ส่วนจีน/อังกฤษให้ OpenAI แปลได้เป็นธรรมชาติกว่า
 */
const TARGET_LANGUAGES = [
  {
    code: 'kk',
    label: '🇰🇿 คาซัค',
    speechCode: 'kk-KZ',
    englishName: 'Kazakh',
    provider: 'google',
  },
  {
    code: 'en',
    label: '🇬🇧 อังกฤษ',
    speechCode: 'en-US',
    englishName: 'English',
    provider: 'openai',
  },
  {
    code: 'zh-CN',
    label: '🇨🇳 จีน',
    speechCode: 'cmn-Hans-CN',
    englishName: 'Simplified Chinese',
    provider: 'openai',
  },
  {
    code: 'my',
    label: '🇲🇲 พม่า',
    speechCode: 'my-MM',
    englishName: 'Burmese',
    provider: 'google',
  },
];

/** subtag แรกแบบตัวพิมพ์เล็ก ใช้เทียบรหัสที่เขียนคนละรูปแบบ */
function baseTag(code) {
  return String(code || '')
    .toLowerCase()
    .split('-')[0];
}

/**
 * @param {string} code
 * @returns {{ code: string, label: string, speechCode: string, englishName: string,
 *             provider: string } | undefined}
 */
function findLanguage(code) {
  if (!code) return undefined;
  return (
    TARGET_LANGUAGES.find((lang) => lang.code === code) ||
    TARGET_LANGUAGES.find((lang) => baseTag(lang.code) === baseTag(code))
  );
}

/**
 * ชื่อภาษาสำหรับแสดงผล (ตัดอิโมจิธงออก)
 * @param {string} code
 */
function languageName(code) {
  const lang = findLanguage(code);
  return lang ? lang.label.replace(/^\S+\s*/, '') : code;
}

/**
 * ชื่อภาษาอังกฤษสำหรับเขียนลง prompt ของ OpenAI
 * @param {string} code
 * @returns {string}
 */
function englishNameFor(code) {
  if (isSameLanguage(code, SOURCE_LANGUAGE)) return SOURCE_ENGLISH_NAME;
  return findLanguage(code)?.englishName || code;
}

/**
 * รหัส BCP-47 สำหรับส่งให้ Google Speech-to-Text
 * @param {string} code รหัสภายในเช่น 'zh-CN'
 * @returns {string | undefined}
 */
function speechCodeFor(code) {
  if (isSameLanguage(code, SOURCE_LANGUAGE)) return SOURCE_SPEECH_CODE;
  return findLanguage(code)?.speechCode;
}

/**
 * แปลงรหัสที่ Google Speech-to-Text คืนกลับมาเป็นรหัสภายในของบอท
 *
 * Google คืนรหัสมาเป็นตัวพิมพ์เล็กทั้งหมด ('cmn-hans-cn', 'th-th') และใช้
 * รหัสคนละชุดกับฝั่ง Translation จึงต้องเทียบกับ speechCode ตรงๆ ก่อน
 * ภาษาที่ไม่รู้จักคืน subtag แรกไว้ เพื่อให้ข้อความแจ้งผู้ใช้ยังบอกได้ว่าเจอภาษาอะไร
 *
 * @param {string} speechCode
 * @returns {string}
 */
function fromSpeechCode(speechCode) {
  if (!speechCode) return '';
  const wanted = String(speechCode).toLowerCase();

  if (wanted === SOURCE_SPEECH_CODE.toLowerCase()) return SOURCE_LANGUAGE;

  const match = TARGET_LANGUAGES.find((lang) => lang.speechCode.toLowerCase() === wanted);
  return match ? match.code : baseTag(speechCode);
}

/**
 * เทียบรหัสภาษาโดยดูเฉพาะ subtag แรก เพราะ Google detect
 * อาจคืน 'zh' ในขณะที่เราเก็บไว้เป็น 'zh-CN'
 * @param {string} a
 * @param {string} b
 */
function isSameLanguage(a, b) {
  if (!a || !b) return false;
  return baseTag(a) === baseTag(b);
}

module.exports = {
  SOURCE_LANGUAGE,
  SOURCE_SPEECH_CODE,
  SOURCE_ENGLISH_NAME,
  TARGET_LANGUAGES,
  findLanguage,
  languageName,
  englishNameFor,
  speechCodeFor,
  fromSpeechCode,
  isSameLanguage,
};
