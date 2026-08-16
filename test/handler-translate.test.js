'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  mockFetch,
  stubModule,
  fakeBot,
  fakeCtx,
  audioResponse,
  speechResponse,
  googleTranslateResponse,
  googleDetectResponse,
  openaiResponse,
  jsonResponse,
} = require('./helpers');

// ภาษาปลายทางของแชทถูกคุมจากตรงนี้ จะได้ไม่ต้องแตะไฟล์ data/ จริง
let chatLanguage = 'kk';
stubModule('../src/store/language-store', {
  getLanguage: () => chatLanguage,
  setLanguage: async () => {},
});

const { register, ERROR_MESSAGE } = require('../src/handlers/translate');

const TELEGRAM_FILE_URL = 'api.telegram.org/file';
const SPEECH_URL = 'speech.googleapis.com';
const GOOGLE_URL = 'translation.googleapis.com';
const OPENAI_URL = 'api.openai.com';

const bot = fakeBot();
register(bot);
const [onVoice] = bot.handlers.voice;
const [onText] = bot.handlers.text;

/** ปิด log ระหว่างเทสต์ไม่ให้รกผลลัพธ์ แล้วคืนสภาพเดิม */
function quiet() {
  const log = console.log;
  const error = console.error;
  console.log = () => {};
  console.error = () => {};
  return () => {
    console.log = log;
    console.error = error;
  };
}

/**
 * รัน handler ข้อความเสียงหนึ่งรอบด้วย route ที่กำหนด
 * @param {{ language: string, transcript: string, spoken: string, routes: Array }} scenario
 */
async function runVoice({ language, transcript, spoken, routes = [] }) {
  const restoreLog = quiet();
  chatLanguage = language;

  const fetchMock = mockFetch([
    [TELEGRAM_FILE_URL, () => audioResponse()],
    [SPEECH_URL, () => speechResponse(transcript, spoken)],
    ...routes,
  ]);

  const ctx = fakeCtx({ voice: true });

  try {
    await onVoice(ctx);
    return { ctx, calls: fetchMock.calls };
  } finally {
    fetchMock.restore();
    restoreLog();
  }
}

/**
 * รัน handler ข้อความพิมพ์หนึ่งรอบ
 * @param {{ language: string, text: string, detected: string, routes: Array }} scenario
 */
async function runText({ language, text, detected, routes = [] }) {
  const restoreLog = quiet();
  chatLanguage = language;

  const fetchMock = mockFetch([
    [`${GOOGLE_URL}/language/translate/v2/detect`, () => googleDetectResponse(detected)],
    ...routes,
  ]);

  const ctx = fakeCtx({ text });
  let nextCalled = false;

  try {
    await onText(ctx, async () => {
      nextCalled = true;
    });
    return { ctx, calls: fetchMock.calls, nextCalled };
  } finally {
    fetchMock.restore();
    restoreLog();
  }
}

test('ขาไป Google: เสียงภาษาไทยในแชทคาซัค ตอบสองบรรทัดพร้อม "ความหมาย:"', async () => {
  const { ctx, calls } = await runVoice({
    language: 'kk',
    transcript: 'สวัสดีครับ สบายดีไหม',
    spoken: 'th-TH',
    routes: [[GOOGLE_URL, () => googleTranslateResponse('Сәлеметсіз бе')]],
  });

  assert.deepEqual(ctx.replies, ['Сәлеметсіз бе\nความหมาย: สวัสดีครับ สบายดีไหม']);

  const translateCall = calls.find((call) => call.url.includes(GOOGLE_URL));
  assert.deepEqual(translateCall.body, {
    q: 'สวัสดีครับ สบายดีไหม',
    source: 'th',
    target: 'kk',
    format: 'text',
  });
  assert.equal(calls.some((call) => call.url.includes(OPENAI_URL)), false);
});

test('ขาไป OpenAI: เสียงภาษาไทยในแชทจีน ได้โครงสร้างเดียวกันเป๊ะ', async () => {
  const { ctx, calls } = await runVoice({
    language: 'zh-CN',
    transcript: 'สวัสดีครับ สบายดีไหม',
    spoken: 'th-TH',
    routes: [[OPENAI_URL, () => openaiResponse('你好，最近好吗')]],
  });

  assert.deepEqual(ctx.replies, ['你好，最近好吗\nความหมาย: สวัสดีครับ สบายดีไหม']);
  assert.equal(calls.some((call) => call.url.includes(OPENAI_URL)), true);
  assert.equal(
    calls.some((call) => call.url.includes(`${GOOGLE_URL}/language`)),
    false
  );
});

test('โครงสร้างข้อความตอบกลับเหมือนกันไม่ว่าจะมาจากผู้ให้บริการไหน', async () => {
  const google = await runVoice({
    language: 'my',
    transcript: 'ขอบคุณครับ',
    spoken: 'th-TH',
    routes: [[GOOGLE_URL, () => googleTranslateResponse('ကျေးဇူးတင်ပါတယ်')]],
  });

  const openai = await runVoice({
    language: 'en',
    transcript: 'ขอบคุณครับ',
    spoken: 'th-TH',
    routes: [[OPENAI_URL, () => openaiResponse('Thank you')]],
  });

  // เทียบเฉพาะ "โครง" ของข้อความ: จำนวนบรรทัด และป้ายกำกับของบรรทัดที่สอง
  const shape = (reply) => {
    const lines = reply.split('\n');
    const [label, ...rest] = lines[1].split(': ');
    return { lines: lines.length, label, original: rest.join(': ') };
  };

  assert.deepEqual(shape(google.ctx.replies[0]), shape(openai.ctx.replies[0]));
  assert.deepEqual(shape(google.ctx.replies[0]), {
    lines: 2,
    label: 'ความหมาย',
    original: 'ขอบคุณครับ',
  });
  assert.equal(google.ctx.replies[0], 'ကျေးဇူးတင်ပါတယ်\nความหมาย: ขอบคุณครับ');
  assert.equal(openai.ctx.replies[0], 'Thank you\nความหมาย: ขอบคุณครับ');
});

test('ขากลับ: เสียงภาษาปลายทางถูกแปลกลับเป็นไทยพร้อม "ต้นฉบับ:"', async () => {
  const { ctx, calls } = await runVoice({
    language: 'zh-CN',
    transcript: '你好',
    spoken: 'cmn-Hans-CN',
    routes: [[OPENAI_URL, () => openaiResponse('สวัสดี')]],
  });

  assert.deepEqual(ctx.replies, ['สวัสดี\nต้นฉบับ: 你好']);

  const body = calls.find((call) => call.url.includes(OPENAI_URL)).body;
  assert.match(body.messages[0].content, /from Simplified Chinese to Thai/);
});

test('ขากลับผ่าน Google ก็ระบุ source เป็นภาษาปลายทาง ไม่ต้องเดาทิศทาง', async () => {
  const { ctx, calls } = await runVoice({
    language: 'kk',
    transcript: 'Сәлеметсіз бе',
    spoken: 'kk-KZ',
    routes: [[GOOGLE_URL, () => googleTranslateResponse('สวัสดี')]],
  });

  assert.deepEqual(ctx.replies, ['สวัสดี\nต้นฉบับ: Сәлеметсіз бе']);

  // เดิมต้องยิงแปลสองครั้งเมื่อเดาทิศทางผิด ตอนนี้รู้ภาษาตั้งแต่ถอดเสียงจึงยิงครั้งเดียว
  const translateCalls = calls.filter((call) => call.url.includes(GOOGLE_URL));
  assert.equal(translateCalls.length, 1);
  assert.equal(translateCalls[0].body.source, 'kk');
  assert.equal(translateCalls[0].body.target, 'th');
});

test('ภาษาที่ไม่ใช่ไทยและไม่ใช่ภาษาปลายทาง แจ้งผู้ใช้พร้อมต้นฉบับ', async () => {
  const { ctx, calls } = await runVoice({
    language: 'kk',
    transcript: 'Привет',
    spoken: 'ru-RU',
  });

  assert.deepEqual(ctx.replies, [
    'ตรวจพบภาษา "ru" ซึ่งไม่ใช่ภาษาไทยหรือคาซัค\nต้นฉบับ: Привет',
  ]);
  // ไม่รู้ทิศทางก็ไม่ต้องเสียคำขอแปลเลย
  assert.equal(calls.filter((call) => !call.url.includes(TELEGRAM_FILE_URL)).length, 1);
});

test('ข้อความพิมพ์ภาษาปลายทางถูกแปลกลับเป็นไทย โดยไม่ต่อท้ายต้นฉบับ', async () => {
  const { ctx } = await runText({
    language: 'en',
    text: 'Where is the airport?',
    detected: 'en',
    routes: [[OPENAI_URL, () => openaiResponse('สนามบินอยู่ที่ไหน')]],
  });

  assert.deepEqual(ctx.replies, ['สนามบินอยู่ที่ไหน']);
});

test('ข้อความพิมพ์ภาษาไทยถูกปล่อยผ่านเงียบๆ ไม่มีคำขอแปล', async () => {
  const { ctx, calls } = await runText({
    language: 'kk',
    text: 'เดี๋ยวไปรับนะ',
    detected: 'th',
  });

  assert.deepEqual(ctx.replies, []);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/detect/);
});

test('คำสั่งที่ขึ้นต้นด้วย / ถูกส่งต่อให้ handler อื่น', async () => {
  const { ctx, nextCalled, calls } = await runText({
    language: 'kk',
    text: '/cl',
    detected: 'th',
  });

  assert.equal(nextCalled, true);
  assert.deepEqual(ctx.replies, []);
  assert.equal(calls.length, 0);
});

test('สถานะ "กำลังพิมพ์" ขึ้นทันทีและหยุดเมื่อจบงาน', async () => {
  const { ctx } = await runVoice({
    language: 'kk',
    transcript: 'สวัสดี',
    spoken: 'th-TH',
    routes: [[GOOGLE_URL, () => googleTranslateResponse('Сәлем')]],
  });

  assert.deepEqual(ctx.chatActions, ['typing']);
});

test('ถอดเสียงล้มเหลว: ตอบข้อความผิดพลาดเดิม และหยุดสถานะกำลังพิมพ์', async () => {
  const { ctx } = await runVoice({
    language: 'zh-CN',
    transcript: 'ไม่ถูกใช้',
    spoken: 'th-TH',
    routes: [],
  });
  // route ของ Speech ถูกแทนที่ด้านล่างแทน เพราะต้องให้มันล้มเหลว
  assert.ok(ctx);

  const restoreLog = quiet();
  chatLanguage = 'zh-CN';
  const fetchMock = mockFetch([
    [TELEGRAM_FILE_URL, () => audioResponse()],
    [SPEECH_URL, () => jsonResponse({ error: 'quota exceeded' }, 429)],
  ]);
  const failing = fakeCtx({ voice: true });

  try {
    await onVoice(failing);
    assert.deepEqual(failing.replies, [ERROR_MESSAGE]);
    assert.deepEqual(failing.chatActions, ['typing']);
  } finally {
    fetchMock.restore();
    restoreLog();
  }
});

test('การแปลล้มเหลวหลังถอดเสียงสำเร็จ ก็ยังตอบข้อความผิดพลาดเดิม', async () => {
  const { ctx } = await runVoice({
    language: 'en',
    transcript: 'สวัสดี',
    spoken: 'th-TH',
    routes: [[OPENAI_URL, () => jsonResponse({ error: 'server error' }, 500)]],
  });

  assert.deepEqual(ctx.replies, [ERROR_MESSAGE]);
});

test('ตรวจภาษาข้อความพิมพ์ล้มเหลว ก็ตอบข้อความผิดพลาดเดิม', async () => {
  const restoreLog = quiet();
  chatLanguage = 'kk';
  const fetchMock = mockFetch([[GOOGLE_URL, () => jsonResponse({ error: 'bad key' }, 403)]]);
  const ctx = fakeCtx({ text: 'Сәлеметсіз бе' });

  try {
    await onText(ctx, async () => {});
    assert.deepEqual(ctx.replies, [ERROR_MESSAGE]);
  } finally {
    fetchMock.restore();
    restoreLog();
  }
});

test('แชทที่ยังไม่ได้ตั้งภาษาไม่ถูกประมวลผลต่อ', async () => {
  const restoreLog = quiet();
  chatLanguage = undefined;
  const fetchMock = mockFetch([]);
  const ctx = fakeCtx({ voice: true });

  try {
    await onVoice(ctx);
    assert.deepEqual(ctx.replies, []);
    assert.equal(fetchMock.calls.length, 0);
  } finally {
    fetchMock.restore();
    restoreLog();
    chatLanguage = 'kk';
  }
});
