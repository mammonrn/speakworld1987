'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

/**
 * อ่านไฟล์ JSON แบบ sync ตอนโหลดโมดูล
 *
 * ไฟล์หายถือเป็นเรื่องปกติ (รันครั้งแรก) ส่วนไฟล์เสียถือว่าอ่านไม่ได้แล้วเตือนไว้
 * แต่ไม่ล้มโปรเซส เพราะเสียข้อมูลไปแล้วก็ยังอยากให้บอทเดินต่อได้
 *
 * @template T
 * @param {string} file
 * @param {T} fallback ค่าที่คืนเมื่อไฟล์ไม่มีหรืออ่านไม่ได้
 * @returns {T}
 */
function readJson(file, fallback) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
    console.warn(`รูปแบบข้อมูลใน ${file} ไม่ถูกต้อง เริ่มต้นใหม่เป็นค่าว่าง`);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`อ่าน ${file} ไม่สำเร็จ เริ่มต้นใหม่เป็นค่าว่าง:`, err.message);
    }
  }
  return fallback;
}

/**
 * สร้างตัวเขียนไฟล์ JSON ที่ต่อคิวให้เอง
 *
 * เขียนลงไฟล์ชั่วคราวก่อนแล้วค่อย rename กันไฟล์พังหากโปรเซสถูกฆ่ากลางคัน
 * และต่อคิวไว้ไม่ให้การเขียนสองครั้งทับกันเมื่อมีหลายแชทใช้งานพร้อมกัน
 *
 * @param {string} file
 * @returns {(data: unknown) => Promise<void>}
 */
function createWriter(file) {
  let queue = Promise.resolve();

  return function write(data) {
    const snapshot = JSON.stringify(data, null, 2);
    const persist = async () => {
      const tmpFile = `${file}.${process.pid}.tmp`;
      await fsp.mkdir(path.dirname(file), { recursive: true });
      await fsp.writeFile(tmpFile, `${snapshot}\n`, 'utf8');
      await fsp.rename(tmpFile, file);
    };

    queue = queue.then(persist, persist);
    return queue;
  };
}

module.exports = { readJson, createWriter };
