'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require('./helpers');

const { toPinyin, annotate } = require('../src/services/pinyin');

test('ถอดเป็นพินอินพร้อมวรรณยุกต์ และขึ้นต้นด้วยตัวพิมพ์ใหญ่', () => {
  assert.equal(toPinyin('你好吗？'), 'Nǐ hǎo ma?');
  assert.equal(toPinyin('谢谢！'), 'Xiè xiè!');
  assert.equal(toPinyin('我要去北京大学，你呢？'), 'Wǒ yào qù běi jīng dà xué, nǐ ne?');
});

test('เครื่องหมายวรรคตอนจีนถูกแปลงเป็นแบบละตินและไม่มีช่องว่างลอย', () => {
  assert.equal(toPinyin('（这是测试）'), '(Zhè shì cè shì)');
  assert.equal(toPinyin('好；很好：真的'), 'Hǎo; hěn hǎo: zhēn de');
  assert.doesNotMatch(toPinyin('你好吗？'), /\s[,.?!:;]/);
});

test('คำที่ไม่ใช่อักษรจีนถูกส่งผ่านไปตามเดิม', () => {
  assert.equal(toPinyin('OK 我去 Bangkok 了'), 'OK wǒ qù Bangkok le');
});

test('ข้อความที่ไม่มีอักษรจีนเลยคืนค่าว่าง', () => {
  assert.equal(toPinyin('2024'), '');
  assert.equal(toPinyin('Hello world'), '');
  assert.equal(toPinyin('สวัสดี'), '');
  assert.equal(toPinyin(''), '');
});

test('annotate ต่อพินอินท้ายข้อความเมื่อปลายทางเป็นภาษาจีน', () => {
  assert.equal(annotate('你好吗？', 'zh-CN'), '你好吗？(Nǐ hǎo ma?)');
  // Google detect คืน 'zh' เฉยๆ ได้ ต้องยังจับคู่กับ zh-CN ติด
  assert.equal(annotate('你好吗？', 'zh'), '你好吗？(Nǐ hǎo ma?)');
});

test('annotate ไม่แตะภาษาอื่น รวมถึงทิศทางแปลกลับเป็นไทย', () => {
  assert.equal(annotate('สวัสดีครับ', 'th'), 'สวัสดีครับ');
  assert.equal(annotate('Xin chào', 'vi'), 'Xin chào');
  assert.equal(annotate('Сәлеметсіз бе', 'kk'), 'Сәлеметсіз бе');
  assert.equal(annotate('Hello', 'en'), 'Hello');
});

test('ปลายทางจีนแต่ข้อความไม่มีอักษรจีน ไม่ต่อวงเล็บซ้ำซ้อน', () => {
  assert.equal(annotate('2024', 'zh-CN'), '2024');
  assert.equal(annotate('WiFi', 'zh-CN'), 'WiFi');
});
