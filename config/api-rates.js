'use strict';

/**
 * อัตราค่าบริการโดยประมาณ ใช้ประเมินค่าใช้จ่ายรายเดือนของผู้ใช้แต่ละคน
 *
 * ตัวเลขพวกนี้ "ไม่ใช่บิลจริง" — เป็นราคาป้ายที่ตรึงไว้ในโค้ด ไม่ได้ดึงจาก
 * ผู้ให้บริการ และไม่ได้หัก free tier ที่แต่ละเจ้าแถมมาให้ ตัวเลขที่ได้จึงเป็น
 * ขอบบน เอาไว้เทียบกันระหว่างผู้ใช้ว่าใครใช้หนักกว่าใครเป็นหลัก
 *
 * ถ้าผู้ให้บริการปรับราคา แก้ที่นี่ที่เดียว รายงานย้อนหลังจะคำนวณด้วยราคาใหม่
 * เพราะเราเก็บแค่ปริมาณการใช้ ไม่ได้เก็บยอดเงินที่คำนวณแล้วลงไฟล์
 */

/**
 * Google Cloud Speech-to-Text (standard model)
 * ราคาป้าย $0.024 ต่อนาที คิดเป็นวินาทีเพื่อให้ตรงกับความยาวคลิปที่ Telegram บอกมา
 */
const SPEECH_USD_PER_SECOND = 0.024 / 60;

/**
 * Google Cloud Translation v2
 * ราคาป้าย $20 ต่อ 1 ล้านตัวอักษร
 */
const GOOGLE_TRANSLATE_USD_PER_CHARACTER = 20 / 1_000_000;

/**
 * OpenAI gpt-4o-mini
 *
 * ราคาป้ายคิดเป็นโทเคน ($0.15 ต่อ 1M input, $0.60 ต่อ 1M output) แต่เราเก็บ
 * ปริมาณเป็นตัวอักษร จึงต้องประมาณสองชั้น:
 *   1. ภาษาไทย/จีนกินโทเคนแพงกว่าอังกฤษมาก ตีคร่าวๆ ที่ 1 โทเคน ต่อ 2 ตัวอักษร
 *   2. ประโยคที่แปลออกมายาวพอๆ กับต้นฉบับ จึงคิด output เท่ากับ input
 *
 * ได้ (1/2) x ($0.15 + $0.60) / 1M = $0.000000375 ต่อตัวอักษร แล้วปัดขึ้นเป็น
 * $0.0000005 เพื่อกลบค่า system prompt ที่ติดไปทุกคำขอแต่ไม่ได้ถูกนับเป็นตัวอักษร
 */
const OPENAI_TRANSLATE_USD_PER_CHARACTER = 0.0000005;

/** ราคาต่อตัวอักษรแยกตามผู้ให้บริการแปล ชื่อคีย์ตรงกับฟิลด์ provider ใน languages.js */
const TRANSLATE_USD_PER_CHARACTER = {
  google: GOOGLE_TRANSLATE_USD_PER_CHARACTER,
  openai: OPENAI_TRANSLATE_USD_PER_CHARACTER,
};

/** สกุลเงินที่ใช้แสดงผลในรายงาน */
const CURRENCY = 'USD';

module.exports = {
  SPEECH_USD_PER_SECOND,
  GOOGLE_TRANSLATE_USD_PER_CHARACTER,
  OPENAI_TRANSLATE_USD_PER_CHARACTER,
  TRANSLATE_USD_PER_CHARACTER,
  CURRENCY,
};
