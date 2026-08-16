'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  mockFetch,
  jsonResponse,
  googleTranslateResponse,
  googleDetectResponse,
  openaiResponse,
  networkError,
} = require('./helpers');

const {
  translateText,
  detectLanguage,
  providerNameFor,
} = require('../src/services/translate');
const { cleanup, systemPrompt, MODEL } = require('../src/services/openai-translate');

const GOOGLE_URL = 'translation.googleapis.com/language/translate/v2';
const OPENAI_URL = 'api.openai.com/v1/chat/completions';

/** route ทั้งสองเจ้าไว้พร้อมกัน เพื่อพิสูจน์ว่าคำขอวิ่งไปเจ้าที่ถูกจริงๆ */
function bothProviders(googleText = 'ผลจาก Google', openaiText = 'ผลจาก OpenAI') {
  return mockFetch([
    [`${GOOGLE_URL}/detect`, () => googleDetectResponse('th')],
    [GOOGLE_URL, () => googleTranslateResponse(googleText)],
    [OPENAI_URL, () => openaiResponse(openaiText)],
  ]);
}

test('คาซัคและพม่าวิ่งไป Google Translate', async () => {
  for (const via of ['kk', 'my']) {
    const fetchMock = bothProviders();

    try {
      const result = await translateText('สวัสดี', { source: 'th', target: via, via });

      assert.equal(providerNameFor(via), 'google');
      assert.equal(fetchMock.calls.length, 1);
      assert.match(fetchMock.calls[0].url, /translation\.googleapis\.com/);
      assert.equal(result, 'ผลจาก Google');
      assert.deepEqual(fetchMock.calls[0].body, {
        q: 'สวัสดี',
        source: 'th',
        target: via,
        format: 'text',
      });
    } finally {
      fetchMock.restore();
    }
  }
});

test('จีนและอังกฤษวิ่งไป OpenAI', async () => {
  for (const via of ['zh-CN', 'en']) {
    const fetchMock = bothProviders();

    try {
      const result = await translateText('สวัสดี', { source: 'th', target: via, via });

      assert.equal(providerNameFor(via), 'openai');
      assert.equal(fetchMock.calls.length, 1);
      assert.match(fetchMock.calls[0].url, /api\.openai\.com/);
      assert.equal(result, 'ผลจาก OpenAI');
    } finally {
      fetchMock.restore();
    }
  }
});

test('ขากลับใช้ผู้ให้บริการเจ้าเดียวกับขาไปของแชทนั้น', async () => {
  const fetchMock = bothProviders();

  try {
    // แชทภาษาจีนแปลกลับเป็นไทย ปลายทางเป็น th แต่ต้องยังวิ่งไป OpenAI
    await translateText('你好', { source: 'zh-CN', target: 'th', via: 'zh-CN' });
    assert.match(fetchMock.calls[0].url, /api\.openai\.com/);
  } finally {
    fetchMock.restore();
  }

  const googleMock = bothProviders();

  try {
    await translateText('Сәлем', { source: 'kk', target: 'th', via: 'kk' });
    assert.match(googleMock.calls[0].url, /translation\.googleapis\.com/);
    assert.equal(googleMock.calls[0].body.target, 'th');
    assert.equal(googleMock.calls[0].body.source, 'kk');
  } finally {
    googleMock.restore();
  }
});

test('แชทที่ภาษาไม่รู้จักตกไปที่ Google เป็นค่าเริ่มต้น', async () => {
  const fetchMock = bothProviders();

  try {
    assert.equal(providerNameFor('ja'), 'google');
    await translateText('สวัสดี', { source: 'th', target: 'ja', via: 'ja' });
    assert.match(fetchMock.calls[0].url, /translation\.googleapis\.com/);
  } finally {
    fetchMock.restore();
  }
});

test('คำขอ OpenAI ใช้โมเดลคุ้มค่าและ system prompt สั่งให้ตอบเฉพาะคำแปล', async () => {
  const fetchMock = bothProviders();

  try {
    await translateText('ไปสนามบินยังไง', { source: 'th', target: 'zh-CN', via: 'zh-CN' });

    const { body, options } = fetchMock.calls[0];
    assert.equal(body.model, MODEL);
    assert.equal(MODEL, 'gpt-4o-mini');
    assert.equal(body.temperature, 0);
    assert.equal(options.headers.Authorization, 'Bearer test-openai-key');

    const [system, user] = body.messages;
    assert.equal(system.role, 'system');
    assert.match(system.content, /ONLY the translated text/);
    assert.match(system.content, /Never add explanations/);
    assert.match(system.content, /from Thai to Simplified Chinese/);
    assert.deepEqual(user, { role: 'user', content: 'ไปสนามบินยังไง' });
  } finally {
    fetchMock.restore();
  }
});

test('system prompt ระบุชื่อภาษาเป็นภาษาอังกฤษทั้งสองทิศทาง', () => {
  assert.match(systemPrompt('th', 'en'), /from Thai to English/);
  assert.match(systemPrompt('en', 'th'), /from English to Thai/);
  assert.match(systemPrompt('zh-CN', 'th'), /from Simplified Chinese to Thai/);
});

test('เครื่องหมายคำพูดที่ครอบผลลัพธ์ถูกตัดออก แต่ของกลางประโยคไม่ถูกแตะ', () => {
  assert.equal(cleanup('  你好  '), '你好');
  assert.equal(cleanup('"Hello there"'), 'Hello there');
  assert.equal(cleanup('“你好”'), '你好');
  assert.equal(cleanup('「こんにちは」'), 'こんにちは');
  assert.equal(cleanup('เขาบอกว่า "ไปเลย" แล้วก็เดินออกไป'), 'เขาบอกว่า "ไปเลย" แล้วก็เดินออกไป');
  assert.equal(cleanup('"ไปเลย" กับ "มาเลย"'), '"ไปเลย" กับ "มาเลย"');
});

test('OpenAI ที่ตอบผิดรูปแบบจนไม่มีข้อความ ถือเป็นข้อผิดพลาด', async () => {
  const fetchMock = mockFetch([[OPENAI_URL, () => jsonResponse({ choices: [] })]]);

  try {
    await assert.rejects(
      () => translateText('สวัสดี', { source: 'th', target: 'en', via: 'en' }),
      /OpenAI ไม่คืนผลการแปล/
    );
  } finally {
    fetchMock.restore();
  }
});

test('สถานะผิดพลาดของ OpenAI ถูกยกขึ้นมาและไม่ยิงซ้ำ', async () => {
  const fetchMock = mockFetch([[OPENAI_URL, () => jsonResponse({ error: 'nope' }, 429)]]);

  try {
    await assert.rejects(
      () => translateText('สวัสดี', { source: 'th', target: 'en', via: 'en' }),
      /OpenAI API ตอบกลับ 429/
    );
    assert.equal(fetchMock.calls.length, 1);
  } finally {
    fetchMock.restore();
  }
});

test('เน็ตสะดุดระหว่างเรียก OpenAI ก็ลองใหม่หนึ่งครั้งเหมือนกัน', async () => {
  const fetchMock = mockFetch([
    [
      OPENAI_URL,
      (_url, _options, attempt) => {
        if (attempt === 1) throw networkError('UND_ERR_SOCKET');
        return openaiResponse('Hello');
      },
    ],
  ]);

  try {
    const result = await translateText('สวัสดี', { source: 'th', target: 'en', via: 'en' });

    assert.equal(result, 'Hello');
    assert.equal(fetchMock.calls.length, 2);
  } finally {
    fetchMock.restore();
  }
});

test('Google ยัง decode HTML entity ที่ปนมากับผลแปล', async () => {
  const fetchMock = mockFetch([
    [GOOGLE_URL, () => googleTranslateResponse('Tom &amp; Jerry &#39;s')],
  ]);

  try {
    const result = await translateText('ทอมกับเจอร์รี่', { source: 'th', target: 'kk', via: 'kk' });
    assert.equal(result, "Tom & Jerry 's");
  } finally {
    fetchMock.restore();
  }
});

test('detectLanguage ยิงไปที่ endpoint /detect ของ Google', async () => {
  const fetchMock = mockFetch([[`${GOOGLE_URL}/detect`, () => googleDetectResponse('kk')]]);

  try {
    const detected = await detectLanguage('Сәлеметсіз бе');

    assert.equal(detected, 'kk');
    assert.match(fetchMock.calls[0].url, /\/detect\?key=test-google-key/);
    assert.deepEqual(fetchMock.calls[0].body, { q: 'Сәлеметсіз бе' });
  } finally {
    fetchMock.restore();
  }
});
