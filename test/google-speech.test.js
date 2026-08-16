'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  mockFetch,
  jsonResponse,
  speechResponse,
  networkError,
} = require('./helpers');

const { transcribe } = require('../src/services/googleSpeech');

const SPEECH_URL = 'speech.googleapis.com/v1/speech:recognize';
const AUDIO = Buffer.from('fake-ogg-opus-bytes');

test('ส่ง config ตรงกับฟอร์แมตเสียงของ Telegram และแนบ API key', async () => {
  const fetchMock = mockFetch([[SPEECH_URL, () => speechResponse('สวัสดีครับ', 'th-TH')]]);

  try {
    await transcribe(AUDIO, 'kk');

    const [call] = fetchMock.calls;
    assert.match(call.url, /key=test-google-key/);
    assert.equal(call.options.method, 'POST');
    assert.equal(call.body.config.encoding, 'OGG_OPUS');
    assert.equal(call.body.config.sampleRateHertz, 48000);
    assert.equal(call.body.audio.content, AUDIO.toString('base64'));
  } finally {
    fetchMock.restore();
  }
});

test('ภาษาหลักเป็นไทยเสมอ และภาษาปลายทางไปอยู่ใน alternativeLanguageCodes', async () => {
  const cases = [
    ['kk', 'kk-KZ'],
    ['en', 'en-US'],
    ['zh-CN', 'cmn-Hans-CN'],
    ['my', 'my-MM'],
    ['vi', 'vi-VN'],
  ];

  for (const [target, expected] of cases) {
    const fetchMock = mockFetch([[SPEECH_URL, () => speechResponse('สวัสดี', 'th-TH')]]);

    try {
      await transcribe(AUDIO, target);
      const { config } = fetchMock.calls[0].body;

      assert.equal(config.languageCode, 'th-TH');
      assert.deepEqual(config.alternativeLanguageCodes, [expected]);
    } finally {
      fetchMock.restore();
    }
  }
});

test('แชทที่ยังไม่ตั้งภาษาฟังเฉพาะภาษาไทย ไม่ส่ง alternativeLanguageCodes', async () => {
  const fetchMock = mockFetch([[SPEECH_URL, () => speechResponse('สวัสดี', 'th-TH')]]);

  try {
    await transcribe(AUDIO);
    const { config } = fetchMock.calls[0].body;

    assert.equal(config.languageCode, 'th-TH');
    assert.equal(config.alternativeLanguageCodes, undefined);
  } finally {
    fetchMock.restore();
  }
});

test('ทิศทางขาไป: ตรวจได้ว่าเป็นภาษาไทย', async () => {
  const fetchMock = mockFetch([[SPEECH_URL, () => speechResponse('ไปสนามบินยังไง', 'th-th')]]);

  try {
    const result = await transcribe(AUDIO, 'zh-CN');

    assert.equal(result.text, 'ไปสนามบินยังไง');
    // Google คืนรหัสเป็นตัวพิมพ์เล็ก ต้องเทียบแบบไม่สนตัวพิมพ์
    assert.equal(result.language, 'th');
  } finally {
    fetchMock.restore();
  }
});

test('ทิศทางขากลับ: รหัสของ Speech ถูกแปลงกลับเป็นรหัสภายในของบอท', async () => {
  const cases = [
    ['cmn-hans-cn', 'zh-CN'],
    ['kk-kz', 'kk'],
    ['my-mm', 'my'],
    ['en-us', 'en'],
    ['vi-vn', 'vi'],
  ];

  for (const [returned, expected] of cases) {
    const fetchMock = mockFetch([[SPEECH_URL, () => speechResponse('hello', returned)]]);

    try {
      const result = await transcribe(AUDIO, expected);
      assert.equal(result.language, expected);
    } finally {
      fetchMock.restore();
    }
  }
});

test('ภาษาที่ไม่รู้จักคืน subtag แรกไว้ให้แจ้งผู้ใช้ได้', async () => {
  const fetchMock = mockFetch([[SPEECH_URL, () => speechResponse('Привет', 'ru-RU')]]);

  try {
    const result = await transcribe(AUDIO, 'kk');
    assert.equal(result.language, 'ru');
  } finally {
    fetchMock.restore();
  }
});

test('เสียงยาวที่ถูกซอยหลายท่อนถูกต่อกลับเป็นข้อความเดียว', async () => {
  const fetchMock = mockFetch([
    [
      SPEECH_URL,
      () =>
        jsonResponse({
          results: [
            { alternatives: [{ transcript: 'สวัสดีครับ' }], languageCode: 'th-TH' },
            { alternatives: [{ transcript: 'ผมชื่อสมชาย' }], languageCode: 'th-TH' },
          ],
        }),
    ],
  ]);

  try {
    const result = await transcribe(AUDIO, 'en');
    assert.equal(result.text, 'สวัสดีครับ ผมชื่อสมชาย');
  } finally {
    fetchMock.restore();
  }
});

test('เสียงที่ถอดไม่ได้ (results ว่าง) โยน error', async () => {
  const fetchMock = mockFetch([[SPEECH_URL, () => jsonResponse({})]]);

  try {
    await assert.rejects(() => transcribe(AUDIO, 'en'), /ไม่คืนข้อความที่ถอดได้/);
  } finally {
    fetchMock.restore();
  }
});

test('สถานะผิดพลาดจาก API ถูกยกขึ้นมาพร้อมรหัสสถานะ และไม่ยิงซ้ำ', async () => {
  const fetchMock = mockFetch([[SPEECH_URL, () => jsonResponse({ error: 'bad key' }, 403)]]);

  try {
    await assert.rejects(() => transcribe(AUDIO, 'en'), /Google Speech-to-Text API ตอบกลับ 403/);
    assert.equal(fetchMock.calls.length, 1);
  } finally {
    fetchMock.restore();
  }
});

test('เน็ตสะดุดแล้วลองใหม่หนึ่งครั้งตาม withRetry เดิม', async () => {
  const fetchMock = mockFetch([
    [
      SPEECH_URL,
      (_url, _options, attempt) => {
        if (attempt === 1) throw networkError('ECONNRESET');
        return speechResponse('สวัสดีครับ', 'th-TH');
      },
    ],
  ]);

  try {
    const result = await transcribe(AUDIO, 'en');

    assert.equal(result.text, 'สวัสดีครับ');
    assert.equal(fetchMock.calls.length, 2);
  } finally {
    fetchMock.restore();
  }
});
