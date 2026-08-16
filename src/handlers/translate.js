'use strict';

const path = require('path');

const { promptFor } = require('../../config/whisper-vocabulary');
const { SOURCE_LANGUAGE, languageName, isSameLanguage } = require('../languages');
const { getLanguage } = require('../store/language-store');
const { transcribe } = require('../services/whisper');
const { translateText } = require('../services/translate');
const { withRetry } = require('../services/http');
const { startTyping } = require('../services/typing');

const ERROR_MESSAGE = 'ขออภัย เกิดข้อผิดพลาดในการแปล ลองใหม่อีกครั้ง';
const DOWNLOAD_TIMEOUT_MS = 30000;

/**
 * ดาวน์โหลดไฟล์เสียงจากเซิร์ฟเวอร์ของ Telegram
 * @param {import('telegraf').Context} ctx
 * @param {string} fileId
 * @returns {Promise<{ buffer: Buffer, filename: string }>}
 */
async function downloadVoice(ctx, fileId) {
  const link = await ctx.telegram.getFileLink(fileId);
  const response = await withRetry('ดาวน์โหลดไฟล์เสียง', () =>
    fetch(link.href, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) })
  );

  if (!response.ok) {
    throw new Error(`ดาวน์โหลดไฟล์เสียงไม่สำเร็จ (${response.status})`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  // Whisper ดูนามสกุลไฟล์เพื่อระบุฟอร์แมต ไฟล์เสียงของ Telegram เป็น .oga
  const extension = path.extname(new URL(link.href).pathname) || '.ogg';

  return { buffer, filename: `voice${extension}` };
}

/**
 * บันทึกภาษาที่ตรวจได้ลง log
 *
 * ผลตรวจภาษาไม่ได้มาจากคำขอของตัวเองอีกแล้ว แต่แฝงมากับผลการแปล
 * เวลาไล่ปัญหาจึงต้องเห็นว่าคำขอแรกยิงไปทางไหนและ Google ตอบว่าเป็นภาษาอะไร
 *
 * @param {import('telegraf').Context} ctx
 * @param {string} detected ภาษาที่ Google ตรวจได้
 * @param {boolean} fromVoice ข้อความมาจากเสียงหรือไม่
 * @param {string} guess ภาษาปลายทางที่เดาไปในคำขอแรก
 */
function logDetected(ctx, detected, fromVoice, guess) {
  const source = fromVoice ? 'เสียง' : 'ข้อความพิมพ์';
  console.log(
    `[แชท ${ctx.chat.id}] ${source}: ตรวจพบภาษา ${detected || 'ไม่ทราบ'} ` +
      `(คำขอแรกแปลไป ${guess})`
  );
}

/**
 * แปลข้อความตามทิศทางที่ตรวจได้ แล้วตอบกลับ
 *
 * - ภาษาปลายทาง → แปลกลับเป็นไทยอัตโนมัติ (ทั้งข้อความพิมพ์และข้อความเสียง)
 * - ภาษาไทย → แปลเป็นภาษาปลายทาง เฉพาะข้อความเสียงเท่านั้น
 *
 * ข้อความ "พิมพ์" ภาษาไทยจะถูกปล่อยผ่านเงียบๆ ไม่เช่นนั้นบอทจะตอบแทรก
 * ทุกประโยคที่คนไทยคุยกันในแชท
 *
 * Google ตรวจภาษาให้พร้อมกับการแปลในคำขอเดียวอยู่แล้ว แต่เราต้องเลือกภาษา
 * ปลายทางก่อนจะรู้ผลตรวจ จึงเดาจากเส้นทางที่ข้อความเข้ามา:
 * ข้อความเสียงมักเป็นคนไทยพูด ส่วนข้อความพิมพ์ที่เราสนใจคือฝั่งตรงข้ามตอบกลับ
 * ถ้าเดาถูก (เกือบทุกครั้ง) จบใน 1 คำขอ ถ้าเดาผิดค่อยยิงอีกคำขอเพื่อแปลอีกทาง
 * ซึ่งเท่ากับจำนวนคำขอแบบเดิมที่ต้องยิง detect ก่อนเสมอ
 *
 * @param {import('telegraf').Context} ctx
 * @param {string} text ข้อความต้นทาง (พิมพ์เข้ามา หรือได้จาก Whisper)
 * @param {string} targetLanguage รหัสภาษาปลายทางของแชทนี้
 * @param {boolean} fromVoice ข้อความนี้มาจากเสียงหรือไม่
 */
async function translateAndReply(ctx, text, targetLanguage, fromVoice) {
  const guess = fromVoice ? targetLanguage : SOURCE_LANGUAGE;
  const first = await translateText(text, guess);
  const detected = first.detected;

  logDetected(ctx, detected, fromVoice, guess);

  if (isSameLanguage(detected, SOURCE_LANGUAGE) && fromVoice) {
    // เดาถูก: ผลที่ได้คือภาษาปลายทางที่ต้องการอยู่แล้ว
    await ctx.reply(`${first.text}\nความหมาย: ${text}`);
    return;
  }

  if (isSameLanguage(detected, targetLanguage)) {
    // ข้อความพิมพ์เดาถูกตั้งแต่คำขอแรก ส่วนข้อความเสียงต้องแปลกลับอีกทาง
    const thai = fromVoice ? await translateText(text, SOURCE_LANGUAGE, detected) : first;
    // ข้อความพิมพ์มองเห็นต้นฉบับอยู่แล้ว จึงแสดงต้นฉบับเฉพาะกรณีที่มาจากเสียง
    await ctx.reply(fromVoice ? `${thai.text}\nต้นฉบับ: ${text}` : thai.text);
    return;
  }

  if (!fromVoice) {
    return;
  }

  await ctx.reply(
    `ตรวจพบภาษา "${detected}" ซึ่งไม่ใช่ภาษาไทยหรือ${languageName(targetLanguage)}\n` +
      `ต้นฉบับ: ${text}`
  );
}

/**
 * ลงทะเบียน handler การแปล
 *
 * ต้องลงทะเบียนหลัง language-select.js เพราะอาศัยให้ด่านนั้นถามภาษาปลายทางก่อน
 * — ข้อความเสียงจะมาถึงที่นี่ก็ต่อเมื่อแชทเลือกภาษาไว้แล้วเท่านั้น
 *
 * @param {import('telegraf').Telegraf} bot
 */
function register(bot) {
  bot.on('voice', async (ctx) => {
    const targetLanguage = getLanguage(ctx.chat.id);
    if (!targetLanguage) return;

    // ขึ้น "กำลังพิมพ์" ทันทีและคาไว้จนจบ ผู้ใช้จะได้ไม่เห็นแชทเงียบระหว่างรอ
    const stopTyping = startTyping(ctx);

    try {
      const { buffer, filename } = await downloadVoice(ctx, ctx.message.voice.file_id);
      // ใบ้เฉพาะคำศัพท์ของภาษาปลายทางที่แชทนี้ตั้งไว้
      const text = await transcribe(buffer, filename, promptFor(targetLanguage));
      await translateAndReply(ctx, text, targetLanguage, true);
    } catch (err) {
      console.error('แปลข้อความเสียงไม่สำเร็จ:', err);
      await ctx.reply(ERROR_MESSAGE);
    } finally {
      stopTyping();
    }
  });

  bot.on('text', async (ctx, next) => {
    // ปล่อยคำสั่งผ่านไปให้ handler อื่นจัดการ
    if (ctx.message.text.startsWith('/')) {
      return next();
    }

    const targetLanguage = getLanguage(ctx.chat.id);
    if (!targetLanguage) return;

    try {
      await translateAndReply(ctx, ctx.message.text, targetLanguage, false);
    } catch (err) {
      console.error('แปลข้อความไม่สำเร็จ:', err);
      await ctx.reply(ERROR_MESSAGE);
    }
  });
}

module.exports = { register, ERROR_MESSAGE };
