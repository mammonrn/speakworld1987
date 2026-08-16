'use strict';

const { SOURCE_LANGUAGE, languageName, isSameLanguage } = require('../languages');
const { getLanguage } = require('../store/language-store');
const { transcribe } = require('../services/googleSpeech');
const { translateText, detectLanguage, providerNameFor } = require('../services/translate');
const { annotate } = require('../services/pinyin');
const { recordSpeech, recordTranslation } = require('../services/usage-tracker');
const { withRetry } = require('../services/http');
const { startTyping } = require('../services/typing');
const { displayName } = require('../users');

const ERROR_MESSAGE = 'ขออภัย เกิดข้อผิดพลาดในการแปล ลองใหม่อีกครั้ง';
const DOWNLOAD_TIMEOUT_MS = 30000;

/**
 * ดาวน์โหลดไฟล์เสียงจากเซิร์ฟเวอร์ของ Telegram
 *
 * ไม่ต้องสนใจนามสกุลไฟล์แล้ว เพราะ Speech-to-Text รับฟอร์แมตจากฟิลด์ encoding
 * ในตัวคำขอโดยตรง ไม่ได้เดาจากชื่อไฟล์เหมือนที่ Whisper ทำ
 *
 * @param {import('telegraf').Context} ctx
 * @param {string} fileId
 * @returns {Promise<Buffer>}
 */
async function downloadVoice(ctx, fileId) {
  const link = await ctx.telegram.getFileLink(fileId);
  const response = await withRetry('ดาวน์โหลดไฟล์เสียง', () =>
    fetch(link.href, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) })
  );

  if (!response.ok) {
    throw new Error(`ดาวน์โหลดไฟล์เสียงไม่สำเร็จ (${response.status})`);
  }

  return Buffer.from(await response.arrayBuffer());
}

/**
 * บันทึกภาษาที่ตรวจได้และผู้ให้บริการที่ใช้ลง log
 *
 * เวลาไล่ปัญหาต้องเห็นสองอย่าง: ตรวจภาษาได้ถูกไหม (ตัดสินทิศทางแปล)
 * และคำขอนั้นวิ่งไปหาเจ้าไหน เพราะสองภาษาแรกกับสองภาษาหลังไปคนละทาง
 *
 * @param {import('telegraf').Context} ctx
 * @param {string} detected ภาษาที่ตรวจได้
 * @param {boolean} fromVoice ข้อความมาจากเสียงหรือไม่
 * @param {string} targetLanguage ภาษาปลายทางของแชท
 */
function logDetected(ctx, detected, fromVoice, targetLanguage) {
  const source = fromVoice ? 'เสียง' : 'ข้อความพิมพ์';
  const detector = fromVoice ? 'Speech-to-Text' : 'Google detect';
  console.log(
    `[แชท ${ctx.chat.id}] ${source}: ตรวจพบภาษา ${detected || 'ไม่ทราบ'} (${detector}) ` +
      `แปลผ่าน ${providerNameFor(targetLanguage)}`
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
 * ภาษาต้นทางถูกตรวจมาก่อนแล้วเสมอ จึงระบุ source ไปให้ผู้ให้บริการแปลได้ตรงๆ
 * และแปลแค่ครั้งเดียวต่อข้อความ ไม่มีกรณีเดาทิศทางผิดแล้วต้องยิงซ้ำอีกทางเหมือนเดิม
 *
 * @param {import('telegraf').Context} ctx
 * @param {string} text ข้อความต้นทาง (พิมพ์เข้ามา หรือได้จากการถอดเสียง)
 * @param {string} targetLanguage รหัสภาษาปลายทางของแชทนี้
 * @param {string} detected ภาษาต้นทางที่ตรวจได้
 * @param {boolean} fromVoice ข้อความนี้มาจากเสียงหรือไม่
 */
async function translateAndReply(ctx, text, targetLanguage, detected, fromVoice) {
  logDetected(ctx, detected, fromVoice, targetLanguage);

  /** แปลหนึ่งครั้งพร้อมจดปริมาณที่ใช้ไว้คิดค่าใช้จ่ายรายเดือน */
  const translateAndCount = async (source, target) => {
    const translated = await translateText(text, { source, target, via: targetLanguage });
    recordTranslation(
      ctx.chat.id,
      text.length,
      providerNameFor(targetLanguage),
      displayName(ctx.from)
    );
    return translated;
  };

  if (isSameLanguage(detected, SOURCE_LANGUAGE)) {
    if (!fromVoice) return;

    const translated = await translateAndCount(SOURCE_LANGUAGE, targetLanguage);
    // ภาษาจีนได้พินอินกำกับต่อท้าย ภาษาอื่นได้ข้อความเดิมกลับมาเฉยๆ
    await ctx.reply(`${annotate(translated, targetLanguage)}\nความหมาย: ${text}`);
    return;
  }

  if (isSameLanguage(detected, targetLanguage)) {
    const thai = await translateAndCount(targetLanguage, SOURCE_LANGUAGE);
    // ข้อความพิมพ์มองเห็นต้นฉบับอยู่แล้ว จึงแสดงต้นฉบับเฉพาะกรณีที่มาจากเสียง
    await ctx.reply(fromVoice ? `${thai}\nต้นฉบับ: ${text}` : thai);
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
      const audio = await downloadVoice(ctx, ctx.message.voice.file_id);
      // ฟังทั้งภาษาไทยและภาษาปลายทางของแชท ผลที่ได้บอกทิศทางการแปลในตัว
      const { text, language } = await transcribe(audio, targetLanguage);
      // คิดตามความยาวคลิปที่ Telegram แจ้งมา ไม่ใช่เวลาที่ใช้ประมวลผลจริง
      recordSpeech(ctx.chat.id, ctx.message.voice.duration, displayName(ctx.from));
      await translateAndReply(ctx, text, targetLanguage, language, true);
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
      const detected = await detectLanguage(ctx.message.text);
      await translateAndReply(ctx, ctx.message.text, targetLanguage, detected, false);
    } catch (err) {
      console.error('แปลข้อความไม่สำเร็จ:', err);
      await ctx.reply(ERROR_MESSAGE);
    }
  });
}

module.exports = { register, ERROR_MESSAGE };
