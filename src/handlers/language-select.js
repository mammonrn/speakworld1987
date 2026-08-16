'use strict';

const { Markup } = require('telegraf');

const { TARGET_LANGUAGES, findLanguage, languageName } = require('../languages');
const { getLanguage, setLanguage } = require('../store/language-store');

const CALLBACK_PREFIX = 'lang';
const ASK_MESSAGE = 'ต้องการให้แปลเป็นภาษาอะไรครับ เลือกได้เลย 👇';

/** ปุ่มเลือกภาษาแบบ 2 คอลัมน์ */
function languageKeyboard() {
  const buttons = TARGET_LANGUAGES.map((lang) =>
    Markup.button.callback(lang.label, `${CALLBACK_PREFIX}:${lang.code}`)
  );
  return Markup.inlineKeyboard(buttons, { columns: 2 });
}

/**
 * ลงทะเบียนขั้นตอนเลือกภาษาปลายทาง
 *
 * handler ข้อความเสียงตัวนี้ต้องถูกลงทะเบียน "ก่อน" translate.js
 * เพราะทำหน้าที่เป็นด่านตรวจ: ถ้าแชทยังไม่เคยเลือกภาษาจะถามก่อนและหยุดไว้
 * ถ้าเลือกแล้วจึงส่งต่อให้ handler ถัดไปด้วย next()
 *
 * @param {import('telegraf').Telegraf} bot
 */
function register(bot) {
  bot.command('changelang', async (ctx) => {
    const current = getLanguage(ctx.chat.id);
    const prefix = current ? `ตอนนี้ตั้งไว้เป็น${languageName(current)}\n` : '';
    await ctx.reply(prefix + ASK_MESSAGE, languageKeyboard());
  });

  bot.action(new RegExp(`^${CALLBACK_PREFIX}:(.+)$`), async (ctx) => {
    const code = ctx.match[1];
    const language = findLanguage(code);

    if (!language) {
      await ctx.answerCbQuery('ไม่รู้จักภาษานี้');
      return;
    }

    await setLanguage(ctx.chat.id, language.code);
    await ctx.answerCbQuery(`เลือก${languageName(language.code)}แล้ว`);
    await ctx.editMessageText(
      `ตั้งภาษาปลายทางเป็น ${language.label} เรียบร้อย\n` +
        'ส่งข้อความเสียงภาษาไทยเข้ามาได้เลย (เปลี่ยนภายหลังด้วย /changelang)'
    );
  });

  bot.on('voice', async (ctx, next) => {
    if (getLanguage(ctx.chat.id)) {
      return next();
    }

    await ctx.reply(ASK_MESSAGE, languageKeyboard());
  });
}

module.exports = { register, languageKeyboard, ASK_MESSAGE };
