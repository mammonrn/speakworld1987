'use strict';

const path = require('path');

const { dataDir } = require('../config');
const { readJson, createWriter } = require('../store/json-file');
const {
  SPEECH_USD_PER_SECOND,
  TRANSLATE_USD_PER_CHARACTER,
  CURRENCY,
} = require('../../config/api-rates');

/**
 * ปริมาณการใช้งานถูกแยกไฟล์ตามเดือน (data/usage-YYYY-MM.json)
 *
 * แยกไฟล์เพราะรายงานที่ใช้จริงคือ "เดือนนี้" ไฟล์เดือนเก่าจึงไม่ต้องถูกอ่านหรือ
 * เขียนซ้ำอีกเลย และเก็บไว้เป็นประวัติได้โดยไม่ทำให้ไฟล์ปัจจุบันโตขึ้นเรื่อยๆ
 *
 * รูปแบบ:
 * {
 *   "month": "2026-08",
 *   "chats": {
 *     "<chatId>": {
 *       "name": "...",
 *       "speechSeconds": 42,
 *       "translation": { "google": 1200, "openai": 350 }
 *     }
 *   }
 * }
 *
 * เก็บเฉพาะ "ปริมาณ" ไม่เก็บยอดเงิน เพราะอัตราใน config/api-rates.js ปรับได้
 * ทีหลัง แล้วอยากให้รายงานย้อนหลังคิดด้วยอัตราใหม่ทันที
 */

/** แคชข้อมูลรายเดือนที่โหลดมาแล้ว: month → { data, write } */
const months = new Map();

/** @returns {string} เดือนปัจจุบันในรูปแบบ YYYY-MM */
function currentMonth(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function fileFor(month) {
  return path.join(dataDir, `usage-${month}.json`);
}

function load(month) {
  const cached = months.get(month);
  if (cached) return cached;

  const file = fileFor(month);
  const stored = readJson(file, { month, chats: {} });
  const entry = {
    data: {
      month,
      chats: stored.chats && typeof stored.chats === 'object' ? stored.chats : {},
    },
    write: createWriter(file),
  };

  months.set(month, entry);
  return entry;
}

/**
 * บันทึกลงดิสก์แบบไม่รอ
 *
 * การบันทึกปริมาณการใช้ไม่ควรทำให้การแปลล้มเหลว ถ้าเขียนไฟล์ไม่ผ่านก็แค่ log
 * แล้วปล่อยให้ผู้ใช้ได้คำแปลไปตามปกติ
 *
 * @param {string} month
 */
function persist(month) {
  const entry = load(month);
  entry.pending = entry.write(entry.data).catch((err) => {
    console.error(`บันทึกปริมาณการใช้งานเดือน ${month} ไม่สำเร็จ:`, err.message);
  });
  return entry.pending;
}

function chatEntry(month, chatId, name) {
  const { data } = load(month);
  const key = String(chatId);

  data.chats[key] ||= { name: '', speechSeconds: 0, translation: {} };
  const chat = data.chats[key];

  // ผู้ใช้เปลี่ยนชื่อโปรไฟล์ได้ ใช้ชื่อล่าสุดที่เห็นเสมอ
  if (name) chat.name = name;

  return chat;
}

/**
 * บันทึกการถอดเสียง คิดตามความยาวคลิปเป็นวินาที
 *
 * @param {number|string} chatId
 * @param {number} seconds ความยาวเสียงที่ Telegram แจ้งมา
 * @param {string} [name] ชื่อที่แสดงของผู้ใช้
 * @param {string} [month]
 */
function recordSpeech(chatId, seconds, name, month = currentMonth()) {
  const duration = Number(seconds);
  if (!Number.isFinite(duration) || duration <= 0) return;

  chatEntry(month, chatId, name).speechSeconds += duration;
  persist(month);
}

/**
 * บันทึกการแปล คิดตามจำนวนตัวอักษรของข้อความต้นทาง แยกตามผู้ให้บริการ
 *
 * @param {number|string} chatId
 * @param {number} characters
 * @param {string} provider 'google' หรือ 'openai'
 * @param {string} [name] ชื่อที่แสดงของผู้ใช้
 * @param {string} [month]
 */
function recordTranslation(chatId, characters, provider, name, month = currentMonth()) {
  const count = Number(characters);
  if (!Number.isFinite(count) || count <= 0 || !provider) return;

  const chat = chatEntry(month, chatId, name);
  chat.translation[provider] = (chat.translation[provider] || 0) + count;
  persist(month);
}

/**
 * ค่าใช้จ่ายโดยประมาณของผู้ใช้หนึ่งคน
 *
 * @param {{ speechSeconds: number, translation: Record<string, number> }} chat
 * @returns {number} ดอลลาร์
 */
function estimateCost(chat) {
  const speech = (chat.speechSeconds || 0) * SPEECH_USD_PER_SECOND;

  const translation = Object.entries(chat.translation || {}).reduce(
    (sum, [provider, characters]) =>
      sum + characters * (TRANSLATE_USD_PER_CHARACTER[provider] || 0),
    0
  );

  return speech + translation;
}

/**
 * สรุปการใช้งานของทั้งเดือน เรียงจากคนที่ใช้มากที่สุดลงมา
 *
 * @param {string} [month] ค่าเริ่มต้นคือเดือนปัจจุบัน
 * @returns {{ month: string, currency: string, total: number,
 *            entries: Array<{ chatId: string, name: string, speechSeconds: number,
 *                             translation: Record<string, number>, cost: number }> }}
 */
function monthlyUsage(month = currentMonth()) {
  const { data } = load(month);

  const entries = Object.entries(data.chats)
    .map(([chatId, chat]) => ({
      chatId,
      name: chat.name || '',
      speechSeconds: chat.speechSeconds || 0,
      translation: { ...chat.translation },
      cost: estimateCost(chat),
    }))
    .sort((a, b) => b.cost - a.cost);

  return {
    month,
    currency: CURRENCY,
    total: entries.reduce((sum, entry) => sum + entry.cost, 0),
    entries,
  };
}

/**
 * รอให้การเขียนไฟล์ที่ค้างอยู่เสร็จ — มีไว้ให้ชุดทดสอบเรียก ไม่ได้ใช้ตอนรันจริง
 * @param {string} [month]
 */
function flush(month = currentMonth()) {
  return months.get(month)?.pending || Promise.resolve();
}

module.exports = {
  recordSpeech,
  recordTranslation,
  monthlyUsage,
  estimateCost,
  currentMonth,
  flush,
};
