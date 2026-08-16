'use strict';

const { googleTranslateApiKey } = require('../config');

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

  const response = await fetch(
    `${BASE_URL}${path}?key=${encodeURIComponent(googleTranslateApiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Google Translate API ตอบกลับ ${response.status}: ${detail.slice(0, 300)}`);
  }

  return response.json();
}

/**
 * แปลข้อความไปยังภาษาปลายทาง
 * @param {string} text
 * @param {string} target รหัสภาษาปลายทาง เช่น 'kk', 'en', 'zh-CN', 'my'
 * @param {string} [source] รหัสภาษาต้นทาง ปล่อยว่างให้ Google เดาเอง
 * @returns {Promise<string>}
 */
async function translateText(text, target, source) {
  const payload = { q: text, target, format: 'text' };
  if (source) {
    payload.source = source;
  }

  const result = await callApi('', payload);
  const translated = result?.data?.translations?.[0]?.translatedText;

  if (typeof translated !== 'string') {
    throw new Error('Google Translate ไม่คืนผลการแปล');
  }

  return decodeEntities(translated);
}

/**
 * ตรวจภาษาของข้อความด้วย detect-language endpoint
 * @param {string} text
 * @returns {Promise<string>} รหัสภาษาที่ตรวจพบ เช่น 'th'
 */
async function detectLanguage(text) {
  const result = await callApi('/detect', { q: text });
  const language = result?.data?.detections?.[0]?.[0]?.language;

  if (typeof language !== 'string') {
    throw new Error('Google Translate ไม่คืนผลการตรวจภาษา');
  }

  return language;
}

module.exports = { translateText, detectLanguage };
