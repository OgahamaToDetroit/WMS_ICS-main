// เทสต์เบาของ labels.js — ล็อกว่า "ค่าที่ล่ามฝั่ง server ส่งจริง" มีป้ายไทยครบทุกตัว
// (ทรง JSON ของล่าม: server/utils/transactionRules.js · authRules.js · productRules.js)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  txTypeLabel, txStatusLabel, stockStatusLabel, userStatusLabel, roleLabel
} from './labels.js';

test('txTypeLabel ครอบค่าที่ล่ามส่งจริง (docTypeToTxType: RECEIVE→INBOUND, ISSUE→OUTBOUND)', () => {
  assert.equal(txTypeLabel('INBOUND'), 'รับเข้า');
  assert.equal(txTypeLabel('OUTBOUND'), 'เบิกออก');
});

test('txStatusLabel ครอบครบ 5 สถานะของล่าม (deriveDocStatus)', () => {
  for (const status of ['Pending', 'Approved', 'Partial', 'Rejected', 'Cancelled']) {
    const label = txStatusLabel(status);
    assert.notEqual(label, status, `สถานะ ${status} ต้องมีป้ายไทย`);
    assert.ok(label.length > 0);
  }
});

test('stockStatusLabel ครอบ 3 สถานะสต็อก (computeStatus)', () => {
  for (const status of ['Active', 'Low Stock', 'Out of Stock']) {
    assert.notEqual(stockStatusLabel(status), status);
  }
});

test('userStatusLabel ครอบ 3 สถานะบัญชี', () => {
  for (const status of ['Active', 'Pending', 'Denied']) {
    assert.notEqual(userStatusLabel(status), status);
  }
});

test('roleLabel ครอบครบ 4 role รวม Viewer (DATABASE.md ข้อ 6.13)', () => {
  for (const role of ['Admin', 'Manager', 'Operator', 'Viewer']) {
    assert.notEqual(roleLabel(role), role);
  }
});

test('ค่านอกชุดคืนค่าเดิมตรงๆ ไม่พัง (กันเผลอคืน undefined แล้วหน้าจอว่าง)', () => {
  assert.equal(txTypeLabel('ADJUST'), 'ADJUST'); // enum ฐานข้อมูล ≠ ค่าของล่าม — ไม่อยู่ใน map ต้องคืนเดิม
  assert.equal(txStatusLabel('WEIRD'), 'WEIRD');
  assert.equal(stockStatusLabel(''), '');
  assert.equal(userStatusLabel('X'), 'X');
  assert.equal(roleLabel('Ghost'), 'Ghost');
});
