'use strict';

/** หน่วงสั้นๆ ก่อนลองใหม่ ไม่ต้อง exponential backoff เพราะลองแค่ครั้งเดียว */
const RETRY_DELAY_MS = 1000;

/** จำนวนครั้งที่ยิงรวมทั้งหมด (1 ครั้งแรก + 1 ครั้งที่ลองใหม่) */
const MAX_ATTEMPTS = 2;

/**
 * รหัสความผิดพลาดระดับเครือข่ายที่ลองใหม่แล้วมีโอกาสสำเร็จ
 * undici ห่อไว้ใน err.cause จึงต้องดูทั้งสองชั้น
 */
const RETRIABLE_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ENOTFOUND',
  'EPIPE',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * ผิดพลาดชั่วคราวหรือไม่
 *
 * นับเฉพาะ timeout กับปัญหาเครือข่าย — ไม่รวมกรณีที่ API ตอบกลับมาแล้วด้วยสถานะ
 * ผิดพลาด (4xx/5xx) เพราะยิงซ้ำก็ได้คำตอบเดิม แถมเสียเวลาผู้ใช้เปล่าๆ
 *
 * @param {unknown} err
 * @returns {boolean}
 */
function isRetriable(err) {
  if (!err || typeof err !== 'object') return false;

  // AbortSignal.timeout() โยน DOMException ชื่อ TimeoutError
  if (err.name === 'TimeoutError' || err.name === 'AbortError') return true;

  return RETRIABLE_CODES.has(err.code) || RETRIABLE_CODES.has(err.cause?.code);
}

/**
 * เรียกฟังก์ชันที่ยิงเน็ต แล้วลองใหม่หนึ่งครั้งถ้าเจอ timeout หรือปัญหาเครือข่าย
 *
 * @template T
 * @param {string} label ชื่อสำหรับเขียน log เวลาลองใหม่
 * @param {() => Promise<T>} run งานที่จะเรียก (สร้าง request ใหม่ทุกครั้งที่ถูกเรียก)
 * @returns {Promise<T>}
 */
async function withRetry(label, run) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run();
    } catch (err) {
      if (attempt >= MAX_ATTEMPTS || !isRetriable(err)) {
        throw err;
      }
      // เอารหัสเครือข่ายขึ้นก่อนชื่อ error เพราะ undici รายงานทุกอย่างเป็น TypeError
      // แต่ต้องรับเฉพาะรหัสที่เป็นสตริง ไม่งั้น DOMException.code (ตัวเลข) จะมาบัง TimeoutError
      const stringCode = (c) => (typeof c === 'string' ? c : null);
      const reason = stringCode(err.cause?.code) || stringCode(err.code) || err.name;
      console.warn(`${label} ล้มเหลวชั่วคราว (${reason}) ลองใหม่อีกครั้งใน ${RETRY_DELAY_MS}ms`);
      await sleep(RETRY_DELAY_MS);
    }
  }
}

module.exports = { withRetry, isRetriable, RETRY_DELAY_MS, MAX_ATTEMPTS };
