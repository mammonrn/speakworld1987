'use strict';

/**
 * Telegram แสดง chat action อยู่ราว 5 วินาทีแล้วหายไปเอง
 * จึงต้องส่งซ้ำถี่กว่านั้นเล็กน้อยระหว่างที่ยังประมวลผลไม่เสร็จ
 */
const TYPING_INTERVAL_MS = 4000;

/**
 * เริ่มแสดง "กำลังพิมพ์" และส่งซ้ำเรื่อยๆ จนกว่าจะสั่งหยุด
 *
 * ส่งครั้งแรกทันทีโดยไม่รอ (ไม่ await) เพื่อไม่ให้ไปหน่วงงานหลัก
 * ถ้าส่งไม่สำเร็จก็แค่ log ทิ้งไว้ ไม่ให้ล้มทั้ง pipeline เพราะแค่ตัวบอกสถานะ
 *
 * @param {import('telegraf').Context} ctx
 * @param {number} [intervalMs] ระยะห่างการส่งซ้ำ
 * @returns {() => void} ฟังก์ชันสำหรับหยุด ต้องเรียกใน finally เสมอ
 */
function startTyping(ctx, intervalMs = TYPING_INTERVAL_MS) {
  const send = () => {
    Promise.resolve()
      .then(() => ctx.sendChatAction('typing'))
      .catch((err) => console.error('ส่งสถานะกำลังพิมพ์ไม่สำเร็จ:', err.message));
  };

  send();
  const timer = setInterval(send, intervalMs);
  // อย่าให้ timer ค้างจนโปรเซสปิดตัวไม่ได้
  timer.unref?.();

  return () => clearInterval(timer);
}

module.exports = { startTyping, TYPING_INTERVAL_MS };
