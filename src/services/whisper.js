'use strict';

const { openaiApiKey } = require('../config');
const { withRetry } = require('./http');

const TRANSCRIPTION_URL = 'https://api.openai.com/v1/audio/transcriptions';
const MODEL = 'whisper-1';
// เสียงยาวๆ บวกกับเน็ตฝั่ง VPS ที่ช้าเป็นบางจังหวะ ทำให้ 60 วิเฉียดเกินไป
const TIMEOUT_MS = 75000;

/**
 * ถอดเสียงเป็นข้อความด้วย OpenAI Whisper
 *
 * ไม่ระบุพารามิเตอร์ language เพื่อให้ Whisper ตรวจภาษาเอง
 * เพราะเสียงที่เข้ามาอาจเป็นภาษาไทย (ขาไป) หรือภาษาปลายทาง (ขากลับ)
 *
 * @param {Buffer} audio ไฟล์เสียงจาก Telegram
 * @param {string} [filename] ชื่อไฟล์พร้อมนามสกุลที่ Whisper รองรับ
 * @param {string} [prompt] คำศัพท์เฉพาะช่วยใบ้ให้ถอดชื่อเฉพาะได้แม่นขึ้น
 * @returns {Promise<string>} ข้อความที่ถอดได้
 */
async function transcribe(audio, filename = 'voice.ogg', prompt = '') {
  if (!openaiApiKey) {
    throw new Error('ไม่ได้ตั้งค่า OPENAI_API_KEY');
  }

  // ประกอบ form ใหม่ทุกครั้งที่ยิง เพราะ body ที่ถูกอ่านไปแล้วใช้ซ้ำไม่ได้
  const response = await withRetry('Whisper', () => {
    const form = new FormData();
    form.append('file', new Blob([audio]), filename);
    form.append('model', MODEL);

    if (prompt) {
      form.append('prompt', prompt);
    }

    return fetch(TRANSCRIPTION_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiApiKey}` },
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Whisper API ตอบกลับ ${response.status}: ${detail.slice(0, 300)}`);
  }

  const result = await response.json();
  const text = typeof result.text === 'string' ? result.text.trim() : '';

  if (!text) {
    throw new Error('Whisper ไม่คืนข้อความที่ถอดได้');
  }

  return text;
}

module.exports = { transcribe };
