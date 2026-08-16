'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

require('./helpers');

const {
  recordSpeech,
  recordTranslation,
  monthlyUsage,
  estimateCost,
  currentMonth,
  flush,
} = require('../src/services/usage-tracker');
const {
  SPEECH_USD_PER_SECOND,
  GOOGLE_TRANSLATE_USD_PER_CHARACTER,
  OPENAI_TRANSLATE_USD_PER_CHARACTER,
} = require('../config/api-rates');

const MONTH = '2026-03';
const OTHER_MONTH = '2026-04';
const NAME_MONTH = '2026-05';

function usageFor(chatId, month = MONTH) {
  return monthlyUsage(month).entries.find((entry) => entry.chatId === String(chatId));
}

test('บันทึกการถอดเสียงเป็นวินาที และสะสมทบกันต่อผู้ใช้', () => {
  recordSpeech(101, 30, 'สมชาย', MONTH);
  recordSpeech(101, 45, 'สมชาย', MONTH);

  assert.equal(usageFor(101).speechSeconds, 75);
});

test('บันทึกการแปลแยกตามผู้ให้บริการ', () => {
  recordTranslation(101, 200, 'google', 'สมชาย', MONTH);
  recordTranslation(101, 50, 'google', 'สมชาย', MONTH);
  recordTranslation(101, 300, 'openai', 'สมชาย', MONTH);

  assert.deepEqual(usageFor(101).translation, { google: 250, openai: 300 });
});

test('คิดค่าใช้จ่ายตามอัตราใน config/api-rates.js', () => {
  const entry = usageFor(101);
  const expected =
    75 * SPEECH_USD_PER_SECOND +
    250 * GOOGLE_TRANSLATE_USD_PER_CHARACTER +
    300 * OPENAI_TRANSLATE_USD_PER_CHARACTER;

  assert.ok(Math.abs(entry.cost - expected) < 1e-12, `${entry.cost} ควรเท่ากับ ${expected}`);
});

test('estimateCost คิดตรงกันเมื่อเรียกกับข้อมูลดิบ', () => {
  const cost = estimateCost({ speechSeconds: 60, translation: { google: 1000 } });
  assert.equal(cost, 60 * SPEECH_USD_PER_SECOND + 1000 * GOOGLE_TRANSLATE_USD_PER_CHARACTER);
});

test('ผู้ให้บริการที่ไม่รู้จักไม่ถูกคิดเงิน แทนที่จะทำให้ยอดพัง', () => {
  assert.equal(estimateCost({ speechSeconds: 0, translation: { unknown: 5000 } }), 0);
});

test('แยกยอดตาม chat_id และเรียงคนที่ใช้หนักที่สุดขึ้นก่อน', () => {
  recordTranslation(202, 10, 'google', 'สมหญิง', MONTH);

  const usage = monthlyUsage(MONTH);
  const ids = usage.entries.map((entry) => entry.chatId);

  assert.deepEqual(ids, ['101', '202']);
  assert.equal(usage.entries[0].cost > usage.entries[1].cost, true);
  assert.equal(usage.total, usage.entries.reduce((sum, entry) => sum + entry.cost, 0));
});

test('คนละเดือนสะสมแยกกัน ไม่ปนกัน', () => {
  recordSpeech(101, 600, 'สมชาย', OTHER_MONTH);

  assert.equal(usageFor(101, MONTH).speechSeconds, 75);
  assert.equal(usageFor(101, OTHER_MONTH).speechSeconds, 600);
  assert.equal(monthlyUsage(OTHER_MONTH).entries.length, 1);
  assert.equal(monthlyUsage(OTHER_MONTH).month, OTHER_MONTH);
});

test('ใช้ชื่อล่าสุดที่เห็น เผื่อผู้ใช้เปลี่ยนชื่อโปรไฟล์', () => {
  // แยกเดือนและ chat ของตัวเอง ยอดของเคสอื่นจะได้ไม่ขยับตาม
  recordSpeech(303, 10, 'สมชาย', NAME_MONTH);
  recordSpeech(303, 10, 'สมชาย ใจดี', NAME_MONTH);

  assert.equal(usageFor(303, NAME_MONTH).name, 'สมชาย ใจดี');
  assert.equal(usageFor(303, NAME_MONTH).speechSeconds, 20);
});

test('ค่าที่ไม่สมเหตุสมผลถูกข้าม ไม่ทำให้ยอดเพี้ยน', () => {
  const before = usageFor(101);

  recordSpeech(101, 0, 'สมชาย', MONTH);
  recordSpeech(101, undefined, 'สมชาย', MONTH);
  recordSpeech(101, -30, 'สมชาย', MONTH);
  recordTranslation(101, 0, 'google', 'สมชาย', MONTH);
  recordTranslation(101, 100, undefined, 'สมชาย', MONTH);

  const after = usageFor(101);
  assert.equal(after.speechSeconds, before.speechSeconds);
  assert.deepEqual(after.translation, before.translation);
});

test('แต่ละเดือนถูกเขียนลงไฟล์ของตัวเอง', async () => {
  await flush(MONTH);
  await flush(OTHER_MONTH);

  const file = path.join(process.env.DATA_DIR, `usage-${MONTH}.json`);
  const stored = JSON.parse(fs.readFileSync(file, 'utf8'));

  assert.equal(stored.month, MONTH);
  assert.equal(stored.chats['101'].speechSeconds, 75);
  assert.deepEqual(stored.chats['101'].translation, { google: 250, openai: 300 });
  assert.ok(fs.existsSync(path.join(process.env.DATA_DIR, `usage-${OTHER_MONTH}.json`)));
});

test('เดือนที่ยังไม่มีข้อมูลคืนรายงานว่าง ไม่ใช่ error', () => {
  const usage = monthlyUsage('2099-12');

  assert.deepEqual(usage.entries, []);
  assert.equal(usage.total, 0);
});

test('currentMonth คืนรูปแบบ YYYY-MM', () => {
  assert.match(currentMonth(), /^\d{4}-\d{2}$/);
  assert.equal(currentMonth(new Date('2026-01-09T00:00:00Z')), '2026-01');
});
