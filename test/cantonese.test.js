'use strict';

process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'test';
process.env.OPENAI_API_KEY = 'test-openai';
process.env.DEEPSEEK_API_KEY = 'test-deepseek';

const test = require('node:test');
const assert = require('node:assert/strict');

const { speechCodeFor, fromSpeechCode, englishNameFor, isSameLanguage } = require('../src/languages');
const { systemPrompt } = require('../src/services/openai-translate');
const { translateText, reasonOf } = require('../src/services/translate');

test('กวางตุ้งฮ่องกงใช้รหัสเสียง yue-Hant-HK และแปลงกลับเป็น yue', () => {
  assert.equal(speechCodeFor('yue'), 'yue-Hant-HK');
  assert.equal(fromSpeechCode('yue-hant-hk'), 'yue');
  assert.equal(isSameLanguage('yue', 'zh-CN'), false);
  assert.match(englishNameFor('yue'), /Cantonese/);
});

test('prompt ปลายทางกวางตุ้งขอ Jyutping ส่วนภาษาอื่นไม่ขอ', () => {
  assert.match(systemPrompt('th', 'yue'), /Jyutping/);
  assert.doesNotMatch(systemPrompt('th', 'zh-CN'), /Jyutping/);
  assert.doesNotMatch(systemPrompt('yue', 'th'), /Jyutping/);
});

function mockFetch(handler) {
  const calls = [];
  global.fetch = async (url) => {
    calls.push(String(url));
    return handler(String(url));
  };
  return calls;
}
const json = (status, body) => ({
  ok: status < 400,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

test('OpenAI ล้ม (400) แล้วตกไป DeepSeek ได้คำแปล', async () => {
  const calls = mockFetch((url) =>
    url.includes('openai.com')
      ? json(400, { error: 'x' })
      : json(200, { choices: [{ message: { content: '唔該(m4 goi1)' } }] })
  );
  const out = await translateText('ขอบคุณ', { source: 'th', target: 'yue', via: 'yue' });
  assert.equal(out, '唔該(m4 goi1)');
  assert.ok(calls.some((u) => u.includes('deepseek.com')));
});

test('ล้มทั้ง OpenAI และ DeepSeek: error มีสาเหตุของทั้งสองเจ้า', async () => {
  mockFetch((url) => json(url.includes('openai.com') ? 401 : 402, { error: 'x' }));
  await assert.rejects(
    translateText('ขอบคุณ', { source: 'th', target: 'yue', via: 'yue' }),
    (err) => /OpenAI: API key ใช้ไม่ได้/.test(err.reason) && /DeepSeek: เครดิตหมด/.test(err.reason)
  );
});

test('reasonOf จัดหมวดสาเหตุ', () => {
  assert.equal(reasonOf(new Error('OpenAI API ตอบกลับ 429: x')), 'ติด rate limit');
  assert.equal(
    reasonOf(new Error('ไม่ได้ตั้งค่า OPENAI_API_KEY')),
    'ยังไม่ได้ตั้งค่า OPENAI_API_KEY'
  );
});
