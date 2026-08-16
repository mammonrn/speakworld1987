'use strict';

const { openaiApiKey } = require('../config');

const TRANSCRIPTION_URL = 'https://api.openai.com/v1/audio/transcriptions';
const MODEL = 'whisper-1';
const TIMEOUT_MS = 60000;

/**
 * ถอดเสียงเป็นข้อความด้วย OpenAI Whisper
 *
 * ไม่ระบุพารามิเตอร์ language เพื่อให้ Whisper ตรวจภาษาเอง
 * เพราะเสียงที่เข้ามาอาจเป็นภาษาไทย (ขาไป) หรือภาษาปลายทาง (ขากลับ)
 *
 * @param {Buffer} audio ไฟล์เสียงจาก Telegram
 * @param {string} [filename] ชื่อไฟล์พร้อมนามสกุลที่ Whisper รองรับ
 * @returns {Promise<string>} ข้อความที่ถอดได้
 */
async function transcribe(audio, filename = 'voice.ogg') {
  if (!openaiApiKey) {
    throw new Error('ไม่ได้ตั้งค่า OPENAI_API_KEY');
  }

  const form = new FormData();
  form.append('file', new Blob([audio]), filename);
  form.append('model', MODEL);

  const response = await fetch(TRANSCRIPTION_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${openaiApiKey}` },
    body: form,
    signal: AbortSignal.timeout(TIMEOUT_MS),
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
