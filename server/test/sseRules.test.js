// เทสต์เบาช่องสัญญาณ SSE — พิน wire format ที่ browser เข้มงวดแบบเงียบ
// (format ผิด browser ไม่ยิง event และไม่มี error ให้เห็น — เทสต์คือที่เดียวที่จับได้)
import test from 'node:test';
import assert from 'node:assert/strict';
import { SSE_EVENTS, formatEventMessage } from '../utils/sseRules.js';

test('ชุด event ครบตามที่หน้าเว็บรอฟัง: transactions/products/users', () => {
  assert.deepEqual([...SSE_EVENTS].sort(), ['products', 'transactions', 'users']);
});

test('wire format ตรงสเปค SSE เป๊ะ: "event: <ชื่อ>\\ndata: {}\\n\\n"', () => {
  for (const event of SSE_EVENTS) {
    assert.equal(formatEventMessage(event), `event: ${event}\ndata: {}\n\n`);
  }
});

test('event นอกชุด (สะกดผิด/ตัวพิมพ์ผิด) ได้ null — ไม่ปล่อยสัญญาณที่หน้าเว็บไม่รู้จัก', () => {
  assert.equal(formatEventMessage('user'), null); // เอกพจน์ — ชุดจริงเป็นพหูพจน์
  assert.equal(formatEventMessage('Products'), null); // ตัวพิมพ์ใหญ่
  assert.equal(formatEventMessage(''), null);
  assert.equal(formatEventMessage(undefined), null);
});
