'use strict';

const { withRetry } = require('./http');
const { systemPrompt } = require('./openai-translate');

const COMPLETIONS_URL = 'https://api.deepseek.com/chat/completions';
const MODEL = 'deepseek-chat';
const TIMEOUT_MS = 30000;

/** key อ่านตอนเรียก ไม่ใช่ตอนโหลดไฟล์ เพื่อให้ตั้งทีหลังใน .env ได้โดยไม่ต้องแก้โค้ด */
function hasKey() {
  return Boolean(process.env.DEEPSEEK_API_KEY);
}

/**
 * ตัวสำรองของ OpenAI: แปลด้วย DeepSeek โดยใช้ prompt เดียวกัน
 * @param {string} text
 * @param {{ source: string, target: string }} languages
 * @returns {Promise<string>}
 */
async function translate(text, { source, target }) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error('ไม่ได้ตั้งค่า DEEPSEEK_API_KEY');
  }

  const response = await withRetry('DeepSeek Translate', () =>
    fetch(COMPLETIONS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        messages: [
          { role: 'system', content: systemPrompt(source, target) },
          { role: 'user', content: text },
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`DeepSeek API ตอบกลับ ${response.status}: ${detail.slice(0, 300)}`);
  }

  const result = await response.json();
  const content = result?.choices?.[0]?.message?.content;
  const translated = typeof content === 'string' ? content.trim() : '';
  if (!translated) {
    throw new Error('DeepSeek ไม่คืนผลการแปล');
  }
  return translated;
}

module.exports = { translate, hasKey, MODEL };
