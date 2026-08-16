'use strict';

// ต้องตั้งค่าก่อนที่ไฟล์ทดสอบจะ require src/config เข้ามา ไม่งั้น config
// จะไม่เจอ token แล้วสั่ง process.exit(1) ทำให้ชุดทดสอบตายทั้งไฟล์
process.env.TELEGRAM_BOT_TOKEN ||= 'test-telegram-token';
process.env.GOOGLE_API_KEY ||= 'test-google-key';
process.env.OPENAI_API_KEY ||= 'test-openai-key';

/** ตอบกลับแบบย่อสำหรับ route ที่ไม่สนใจรายละเอียด */
function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
    arrayBuffer: async () => Buffer.from(String(payload)),
  };
}

/**
 * สลับ global.fetch เป็นตัวปลอมที่จ่ายคำตอบตาม URL
 *
 * routes เป็นคู่ [ชิ้นส่วนของ URL, ตัวจัดการ] — ตัวจัดการรับ (url, options)
 * แล้วคืน Response ปลอม หรือโยน error เพื่อจำลองเน็ตสะดุด
 *
 * @param {Array<[string, (url: string, options: object) => unknown]>} routes
 * @returns {{ calls: Array<{ url: string, options: object, body: unknown }>, restore: () => void }}
 */
function mockFetch(routes) {
  const original = global.fetch;
  const calls = [];

  global.fetch = async (url, options = {}) => {
    const href = String(url);
    let body;
    try {
      body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
    } catch {
      body = options.body;
    }
    calls.push({ url: href, options, body });

    const route = routes.find(([fragment]) => href.includes(fragment));
    if (!route) {
      throw new Error(`ไม่ได้เตรียม route ไว้สำหรับ ${href}`);
    }

    const result = await route[1](href, options, calls.length);
    return result ?? jsonResponse({});
  };

  return {
    calls,
    restore: () => {
      global.fetch = original;
    },
  };
}

/**
 * ยัด module ปลอมลง require cache ก่อนที่โค้ดจริงจะ require เข้ามา
 *
 * ใช้กับ language-store เป็นหลัก เพื่อไม่ให้ชุดทดสอบไปอ่าน/เขียนไฟล์ JSON จริง
 *
 * @param {string} request เส้นทางแบบเดียวกับที่ใช้ require
 * @param {object} exports สิ่งที่อยากให้ module นั้นคืน
 * @returns {() => void} คืนสภาพเดิม
 */
function stubModule(request, exports) {
  const resolved = require.resolve(request);
  const previous = require.cache[resolved];

  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    path: resolved,
    loaded: true,
    children: [],
    paths: [],
    exports,
  };

  return () => {
    if (previous) {
      require.cache[resolved] = previous;
    } else {
      delete require.cache[resolved];
    }
  };
}

/**
 * bot ปลอมที่แค่เก็บ handler ที่ถูกลงทะเบียนไว้ให้เรียกเองได้
 * @returns {{ on: Function, command: Function, action: Function, start: Function,
 *             handlers: Record<string, Function[]> }}
 */
function fakeBot() {
  const handlers = {};
  const collect = (event, fn) => {
    (handlers[event] ||= []).push(fn);
  };

  return {
    handlers,
    on: (event, fn) => collect(event, fn),
    command: (name, fn) => collect(`command:${name}`, fn),
    action: (_pattern, fn) => collect('action', fn),
    start: (fn) => collect('start', fn),
  };
}

/**
 * ctx ปลอมของ Telegraf เท่าที่ handler การแปลใช้จริง
 *
 * @param {{ voice?: boolean, text?: string, chatId?: number, fileUrl?: string }} options
 */
function fakeCtx({ voice = false, text = '', chatId = 42, fileUrl } = {}) {
  const replies = [];
  const chatActions = [];

  return {
    chat: { id: chatId },
    message: voice
      ? { message_id: 7, voice: { file_id: 'voice-file-id' } }
      : { message_id: 7, text },
    replies,
    chatActions,
    reply: async (message) => {
      replies.push(message);
    },
    sendChatAction: async (action) => {
      chatActions.push(action);
    },
    telegram: {
      getFileLink: async () =>
        new URL(fileUrl || 'https://api.telegram.org/file/bot-token/voice/file_1.oga'),
      setMessageReaction: async () => {},
    },
  };
}

/** Response ปลอมของไฟล์เสียงที่ดาวน์โหลดจาก Telegram */
function audioResponse(bytes = 'fake-ogg-opus-bytes') {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => Buffer.from(bytes),
    text: async () => bytes,
  };
}

/** Response ปลอมของ Google Speech-to-Text */
function speechResponse(transcript, languageCode) {
  return jsonResponse({
    results: [{ alternatives: [{ transcript, confidence: 0.98 }], languageCode }],
  });
}

/** Response ปลอมของ Google Translation v2 */
function googleTranslateResponse(translatedText) {
  return jsonResponse({ data: { translations: [{ translatedText }] } });
}

/** Response ปลอมของ Google Translation v2 endpoint /detect */
function googleDetectResponse(language) {
  return jsonResponse({ data: { detections: [[{ language, confidence: 1, isReliable: true }]] } });
}

/** Response ปลอมของ OpenAI chat completion */
function openaiResponse(content) {
  return jsonResponse({ choices: [{ message: { role: 'assistant', content } }] });
}

/** error แบบเดียวกับที่ undici โยนตอนเน็ตสะดุด เพื่อทดสอบ retry */
function networkError(code = 'ECONNRESET') {
  const err = new TypeError('fetch failed');
  err.cause = { code };
  return err;
}

module.exports = {
  jsonResponse,
  mockFetch,
  stubModule,
  fakeBot,
  fakeCtx,
  audioResponse,
  speechResponse,
  googleTranslateResponse,
  googleDetectResponse,
  openaiResponse,
  networkError,
};
