// เทสต์เบา Web Push (DATABASE.md ข้อ 6.16) — เฉพาะกติกาที่ database บังคับเองไม่ได้
import test from 'node:test';
import assert from 'node:assert/strict';
import { isDeadSubscription, buildResolvePush } from '../utils/pushRules.js';

test('isDeadSubscription: 410 Gone / 404 Not Found = อุปกรณ์ตายถาวร → ลบแถวจริงได้ (ข้อยกเว้น soft delete ที่ตั้งใจ)', () => {
  assert.equal(isDeadSubscription(410), true);
  assert.equal(isDeadSubscription(404), true);
});

test('isDeadSubscription: ปัญหาชั่วคราว (429/5xx/ไม่มีรหัส) ห้ามถือว่าตาย — รอบหน้าอาจส่งถึง', () => {
  assert.equal(isDeadSubscription(429), false);
  assert.equal(isDeadSubscription(500), false);
  assert.equal(isDeadSubscription(undefined), false);
});

test('buildResolvePush: อนุมัติครบทุกบรรทัด → ✅ + ชวนมารับของ', () => {
  const p = buildResolvePush({
    docNo: 'ISS-6907-0001',
    docStatus: 'CONFIRMED',
    lines: [{ qtyRequested: 2, qtyConfirmed: 2 }, { qtyRequested: 1, qtyConfirmed: 1 }]
  });
  assert.equal(p.title, 'ผลใบเบิก ISS-6907-0001');
  assert.equal(p.body, '✅ อนุมัติแล้ว — มารับสินค้าได้เลย');
  assert.equal(p.url, '/homepage');
});

test('buildResolvePush: ให้ไม่ครบบางบรรทัด → ⚠️ บางส่วน + หมายเหตุต่อท้าย', () => {
  const p = buildResolvePush({
    docNo: 'ISS-6907-0002',
    docStatus: 'CONFIRMED',
    lines: [{ qtyRequested: 5, qtyConfirmed: 3 }],
    note: 'ของเหลือไม่พอ'
  });
  assert.equal(p.body, '⚠️ อนุมัติบางส่วน — มารับสินค้าได้เลย\nหมายเหตุ: ของเหลือไม่พอ');
});

test('buildResolvePush: ใบถูกปิดเป็น CANCELLED (ปฏิเสธ/อนุมัติ 0 ทุกบรรทัด) → ❌ และห้ามชวนมารับของ', () => {
  const p = buildResolvePush({
    docNo: 'ISS-6907-0003',
    docStatus: 'CANCELLED',
    lines: [{ qtyRequested: 2, qtyConfirmed: 0 }],
    note: 'ไม่อนุมัติ'
  });
  assert.equal(p.body, '❌ ถูกปฏิเสธ\nหมายเหตุ: ไม่อนุมัติ');
  assert.ok(!p.body.includes('มารับสินค้า'));
});
