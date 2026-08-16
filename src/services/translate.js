'use strict';

const { googleTranslateApiKey } = require('../config');
const { withRetry } = require('./http');

const BASE_URL = 'https://translation.googleapis.com/language/translate/v2';
const TIMEOUT_MS = 15000;

const HTML_ENTITIES = {
  '&amp;': '&',
  '&quot;': '"',
  '&#39;': "'",
  '&lt;': '<',
  '&gt;': '>',
  '&nbsp;': ' ',
};

/** Google คืนค่าที่ escape เป็น HTML entity มาบ้างแม้จะขอ format=text */
function decodeEntities(text) {
  return text.replace(/&(?:amp|quot|#39|lt|gt|nbsp);/g, (entity) => HTML_ENTITIES[entity]);
}

/**
 * @param {string} path ส่วนต่อท้าย endpoint เช่น '' หรือ '/detect'
 * @param {Record<string, unknown>} body
 */
async function callApi(path, body) {
  if (!googleTranslateApiKey) {
    throw new Error('ไม่ได้ตั้งค่า GOOGLE_TRANSLATE_API_KEY');
  }

  const response = await withRetry(`Google Translate${path}`, () =>
    fetch(`${BASE_URL}${path}?key=${encodeURIComponent(googleTranslateApiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Google Translate API ตอบกลับ ${response.status}: ${detail.slice(0, 300)}`);
  }

  return response.json();
}

/**
 * แปลข้อความไปยังภาษาปลายทาง พร้อมบอกภาษาต้นทางที่ Google ตรวจได้
 *
 * เมื่อไม่ระบุ source Google จะตรวจภาษาให้เองและคืน detectedSourceLanguage
 * มาในผลลัพธ์เดียวกัน จึงไม่ต้องยิง detect endpoint แยกอีกคำขอ
 *
 * @param {string} text
 * @param {string} target รหัสภาษาปลายทาง เช่น 'th', 'kk', 'zh-CN'
 * @param {string} [source] ระบุเมื่อรู้ภาษาต้นทางแน่แล้ว ปล่อยว่างให้ Google ตรวจเอง
 * @returns {Promise<{ text: string, detected: string }>}
 */
async function translateText(text, target, source) {
  const payload = { q: text, target, format: 'text' };
  if (source) {
    payload.source = source;
  }

  const result = await callApi('', payload);
  const translation = result?.data?.translations?.[0];

  if (typeof translation?.translatedText !== 'string') {
    throw new Error('Google Translate ไม่คืนผลการแปล');
  }

  return {
    text: decodeEntities(translation.translatedText),
    // ระบุ source ไปเองเมื่อไหร่ Google จะไม่ส่ง detectedSourceLanguage กลับมา
    detected: translation.detectedSourceLanguage || source || '',
  };
}

module.exports = { translateText };
