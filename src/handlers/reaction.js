'use strict';

// Telegram รับเฉพาะอักขระ ❤ ตัวเปล่า (U+2764) ห้ามมี variation selector ต่อท้าย
const HEART = '❤';

/**
 * ลงทะเบียนการ react ข้อความเสียงด้วย ❤ ทันทีที่ได้รับ
 *
 * ต้องเป็น handler ตัวแรกสุดของ chain เพื่อให้หัวใจขึ้นก่อนขั้นตอนอื่นทั้งหมด
 * (ทั้งการถามภาษาและการถอดเสียง) ผู้ใช้จะได้รู้ทันทีว่าบอทเห็นเสียงแล้ว
 * โดยไม่ต้องรอผลแปล
 *
 * @param {import('telegraf').Telegraf} bot
 */
function register(bot) {
  bot.on('voice', async (ctx, next) => {
    try {
      await ctx.telegram.setMessageReaction(ctx.chat.id, ctx.message.message_id, [
        { type: 'emoji', emoji: HEART },
      ]);
    } catch (err) {
      // react ไม่สำเร็จไม่ใช่เรื่องคอขาดบาดตาย ปล่อยให้แปลต่อไปได้
      console.error('react ข้อความเสียงไม่สำเร็จ:', err);
    }

    return next();
  });
}

module.exports = { register, HEART };
