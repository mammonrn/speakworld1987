'use strict';

const path = require('path');

const { promptFor } = require('../../config/whisper-vocabulary');
const { SOURCE_LANGUAGE, languageName, isSameLanguage } = require('../languages');
const { getLanguage } = require('../store/language-store');
const { transcribe } = require('../services/whisper');
const { translateText, detectLanguage } = require('../services/translate');

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
  const response = await fetch(link.href, {
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`ดาวน์โหลดไฟล์เสียงไม่สำเร็จ (${response.status})`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  // Whisper ดูนามสกุลไฟล์เพื่อระบุฟอร์แมต ไฟล์เสียงของ Telegram เป็น .oga
  const extension = path.extname(new URL(link.href).pathname) || '.ogg';

  return { buffer, filename: `voice${extension}` };
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
 * @param {import('telegraf').Context} ctx
 * @param {string} text ข้อความต้นทาง (พิมพ์เข้ามา หรือได้จาก Whisper)
 * @param {string} targetLanguage รหัสภาษาปลายทางของแชทนี้
 * @param {boolean} fromVoice ข้อความนี้มาจากเสียงหรือไม่
 */
async function translateAndReply(ctx, text, targetLanguage, fromVoice) {
  const detected = await detectLanguage(text);

  if (isSameLanguage(detected, targetLanguage)) {
    const thai = await translateText(text, SOURCE_LANGUAGE);
    // ข้อความพิมพ์มองเห็นต้นฉบับอยู่แล้ว จึงแสดงต้นฉบับเฉพาะกรณีที่มาจากเสียง
    await ctx.reply(fromVoice ? `${thai}\nต้นฉบับ: ${text}` : thai);
    return;
  }

  if (!fromVoice) {
    return;
  }

  if (isSameLanguage(detected, SOURCE_LANGUAGE)) {
    const translated = await translateText(text, targetLanguage, SOURCE_LANGUAGE);
    await ctx.reply(`${translated}\nความหมาย: ${text}`);
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

    try {
      await ctx.sendChatAction('typing');
      const { buffer, filename } = await downloadVoice(ctx, ctx.message.voice.file_id);
      // ใบ้เฉพาะคำศัพท์ของภาษาปลายทางที่แชทนี้ตั้งไว้
      const text = await transcribe(buffer, filename, promptFor(targetLanguage));
      await translateAndReply(ctx, text, targetLanguage, true);
    } catch (err) {
      console.error('แปลข้อความเสียงไม่สำเร็จ:', err);
      await ctx.reply(ERROR_MESSAGE);
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
