'use strict';

/**
 * ตรวจ pipeline เสียง → ข้อความ → คำแปล กับ API จริง (ใช้ key ใน .env ไม่พิมพ์ key)
 *
 *   node scripts/pipeline-check.js
 *
 * 1) สร้างเสียงไทยและเสียงกวางตุ้งด้วย Google TTS (OGG_OPUS 48 kHz เหมือน voice ของ Telegram)
 * 2) ถอดเสียงด้วย transcribe() ของบอทจริง โดยตั้งภาษาปลายทางแชทเป็นกวางตุ้ง
 * 3) แปลต่อด้วย translateText() (OpenAI → DeepSeek ถ้ามี key)
 * ผ่านเมื่อ: เสียงไทยถูกตรวจเป็น th และเสียงกวางตุ้งถูกตรวจเป็น yue
 */

const { googleApiKey } = require('../src/config');
const { transcribe } = require('../src/services/googleSpeech');
const { translateText } = require('../src/services/translate');

const TTS_URL = 'https://texttospeech.googleapis.com/v1/text:synthesize';

async function synth(text, languageCode, name) {
  const response = await fetch(`${TTS_URL}?key=${encodeURIComponent(googleApiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode, name },
      audioConfig: { audioEncoding: 'OGG_OPUS', sampleRateHertz: 48000 },
    }),
  });
  if (!response.ok) {
    throw new Error(`TTS ${languageCode} ตอบกลับ ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  const { audioContent } = await response.json();
  return Buffer.from(audioContent, 'base64');
}

async function run(label, text, languageCode, voice, expectLang) {
  const audio = await synth(text, languageCode, voice);
  const heard = await transcribe(audio, 'yue');
  const source = heard.language || 'unknown';
  const target = source === 'th' ? 'yue' : 'th';
  const translated = await translateText(heard.text, { source, target, via: 'yue' });
  const ok = source === expectLang;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: ได้ยิน="${heard.text}" ภาษา=${source} → ${translated}`);
  return ok;
}

(async () => {
  if (!googleApiKey) throw new Error('ไม่มี GOOGLE_API_KEY');
  const results = [];
  results.push(await run('ไทย', 'สวัสดีครับ วันนี้อากาศดีมาก ไปกินข้าวกันไหม', 'th-TH', 'th-TH-Standard-A', 'th'));
  results.push(await run('กวางตุ้ง', '你好，今日天氣好好，一齊去食飯好唔好？', 'yue-HK', 'yue-HK-Standard-A', 'yue'));
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((err) => {
  console.error('FAIL', err.message);
  process.exit(1);
});
