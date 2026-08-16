'use strict';

/** ภาษาต้นทางที่บอทคาดหวังจากผู้ใช้ */
const SOURCE_LANGUAGE = 'th';

/**
 * ภาษาปลายทางที่รองรับ
 * code = รหัสภาษาของ Google Cloud Translation v2
 */
const TARGET_LANGUAGES = [
  { code: 'kk', label: '🇰🇿 คาซัค' },
  { code: 'en', label: '🇬🇧 อังกฤษ' },
  { code: 'zh-CN', label: '🇨🇳 จีน' },
  { code: 'my', label: '🇲🇲 พม่า' },
];

/**
 * @param {string} code
 * @returns {{ code: string, label: string } | undefined}
 */
function findLanguage(code) {
  return TARGET_LANGUAGES.find((lang) => lang.code === code);
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
 * เทียบรหัสภาษาโดยดูเฉพาะ subtag แรก เพราะ Google detect
 * อาจคืน 'zh' ในขณะที่เราเก็บไว้เป็น 'zh-CN'
 * @param {string} a
 * @param {string} b
 */
function isSameLanguage(a, b) {
  if (!a || !b) return false;
  const base = (code) => String(code).toLowerCase().split('-')[0];
  return base(a) === base(b);
}

module.exports = {
  SOURCE_LANGUAGE,
  TARGET_LANGUAGES,
  findLanguage,
  languageName,
  isSameLanguage,
};
