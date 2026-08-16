'use strict';

const { googleApiKey } = require('../config');
const { withRetry } = require('./http');
const { SOURCE_SPEECH_CODE, speechCodeFor, fromSpeechCode } = require('../languages');

const RECOGNIZE_URL = 'https://speech.googleapis.com/v1/speech:recognize';

// ข้อความเสียงของ Telegram เป็น OGG/Opus 48 kHz เสมอ ส่งเข้า Google ได้ตรงๆ
// ไม่ต้องแปลงฟอร์แมตก่อน จึงไม่ต้องพึ่ง ffmpeg บนเครื่องที่รันบอท
const ENCODING = 'OGG_OPUS';
const SAMPLE_RATE_HERTZ = 48000;

// speech:recognize เป็นแบบ synchronous รับเสียงยาวได้ไม่เกิน 1 นาที
// ข้อความเสียงในแชทสั้นกว่านั้นเกือบทั้งหมด 60 วิจึงเหลือเฟือ
const TIMEOUT_MS = 60000;

/**
 * ถอดเสียงเป็นข้อความด้วย Google Cloud Speech-to-Text พร้อมบอกภาษาที่ตรวจได้
 *
 * ตั้ง languageCode เป็นไทยไว้เป็นหลักเพราะเสียงส่วนใหญ่คือผู้ใช้คนไทยพูดขาไป
 * แล้วใส่ภาษาปลายทางของแชทลง alternativeLanguageCodes เพื่อให้ขากลับ
 * (อีกฝ่ายพูดตอบมา) ถูกตรวจจับได้ในคำขอเดียวกัน ไม่ต้องเดาทิศทางจากช่องทาง
 * ที่ข้อความเข้ามาเหมือนเดิม
 *
 * @param {Buffer} audio ไฟล์เสียงจาก Telegram
 * @param {string} [targetLanguage] ภาษาปลายทางของแชท (ไม่ระบุ = ฟังเฉพาะภาษาไทย)
 * @returns {Promise<{ text: string, language: string }>} ข้อความ และรหัสภาษาภายในที่ตรวจได้
 */
async function transcribe(audio, targetLanguage) {
  if (!googleApiKey) {
    throw new Error('ไม่ได้ตั้งค่า GOOGLE_API_KEY');
  }

  const config = {
    encoding: ENCODING,
    sampleRateHertz: SAMPLE_RATE_HERTZ,
    languageCode: SOURCE_SPEECH_CODE,
    enableAutomaticPunctuation: true,
  };

  // แชทที่ยังไม่ได้ตั้งภาษาปลายทางฟังเฉพาะภาษาไทย จะได้ไม่เอนไปทางภาษาไหน
  const alternative = targetLanguage ? speechCodeFor(targetLanguage) : undefined;
  if (alternative && alternative !== SOURCE_SPEECH_CODE) {
    config.alternativeLanguageCodes = [alternative];
  }

  const body = JSON.stringify({ config, audio: { content: audio.toString('base64') } });

  const response = await withRetry('Google Speech-to-Text', () =>
    fetch(`${RECOGNIZE_URL}?key=${encodeURIComponent(googleApiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `Google Speech-to-Text API ตอบกลับ ${response.status}: ${detail.slice(0, 300)}`
    );
  }

  const result = await response.json();
  const results = Array.isArray(result?.results) ? result.results : [];

  // เสียงยาวถูกซอยเป็นหลายท่อน แต่ละท่อนมีผลที่มั่นใจที่สุดอยู่ที่ alternatives[0]
  const text = results
    .map((entry) => entry?.alternatives?.[0]?.transcript)
    .filter((part) => typeof part === 'string' && part.trim())
    .join(' ')
    .trim();

  if (!text) {
    throw new Error('Google Speech-to-Text ไม่คืนข้อความที่ถอดได้');
  }

  // languageCode ติดมากับแต่ละท่อน ใช้ท่อนแรกที่รายงานมาเป็นภาษาของทั้งข้อความ
  const detected = results.find((entry) => entry?.languageCode)?.languageCode || '';

  return { text, language: fromSpeechCode(detected) };
}

module.exports = { transcribe, ENCODING, SAMPLE_RATE_HERTZ };
