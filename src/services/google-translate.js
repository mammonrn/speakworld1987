'use strict';

const { googleApiKey } = require('../config');
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
  if (!googleApiKey) {
    throw new Error('ไม่ได้ตั้งค่า GOOGLE_API_KEY');
  }

  const response = await withRetry(`Google Translate${path}`, () =>
    fetch(`${BASE_URL}${path}?key=${encodeURIComponent(googleApiKey)}`, {
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
 * แปลข้อความด้วย Google Cloud Translation v2
 *
 * @param {string} text
 * @param {{ source: string, target: string }} languages รหัสภาษาแบบ Translation v2
 * @returns {Promise<string>} ข้อความที่แปลแล้ว
 */
async function translate(text, { source, target }) {
  const result = await callApi('', { q: text, source, target, format: 'text' });
  const translation = result?.data?.translations?.[0];

  if (typeof translation?.translatedText !== 'string') {
    throw new Error('Google Translate ไม่คืนผลการแปล');
  }

  return decodeEntities(translation.translatedText);
}

/**
 * ตรวจภาษาของข้อความ
 *
 * ใช้กับข้อความ "พิมพ์" เท่านั้น — ข้อความเสียงได้ภาษามาพร้อมผลถอดเสียงจาก
 * Speech-to-Text อยู่แล้ว จึงไม่ต้องยิงคำขอนี้เพิ่ม
 *
 * @param {string} text
 * @returns {Promise<string>} รหัสภาษาที่ตรวจได้ ('' เมื่อ Google ไม่ฟันธง)
 */
async function detectLanguage(text) {
  const result = await callApi('/detect', { q: text });
  const detection = result?.data?.detections?.[0]?.[0];
  return typeof detection?.language === 'string' ? detection.language : '';
}

module.exports = { translate, detectLanguage, decodeEntities, TIMEOUT_MS };
