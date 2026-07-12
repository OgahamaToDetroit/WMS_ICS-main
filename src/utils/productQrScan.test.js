import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyScanResponse, hasExactScannedProduct, resolveProductQrScan } from './productQrScan.js';

test('QR ที่ถูกต้องเปลี่ยนเป็นคำค้น item_id 5 หลักท้าย', () => {
  assert.deepEqual(resolveProductQrScan('116615041', 'คำค้นเดิม'), {
    ok: true,
    itemId: '15041',
    searchTerm: '15041'
  });
});

test('คงเลขศูนย์นำหน้าของ item_id ในคำค้น', () => {
  assert.deepEqual(resolveProductQrScan('066802001'), {
    ok: true,
    itemId: '02001',
    searchTerm: '02001'
  });
});

test('ยังรองรับบาร์โค้ด item_id 5 หลักโดยไม่บังคับให้เป็น QR 9 หลัก', () => {
  assert.deepEqual(resolveProductQrScan(' 02001 '), {
    ok: true,
    itemId: '02001',
    searchTerm: '02001'
  });
});

test('QR ที่ผิดไม่เขียนทับคำค้นเดิม', () => {
  assert.deepEqual(resolveProductQrScan('11661504A', 'สายไฟ'), {
    ok: false,
    error: 'รหัสไม่ถูกรูปแบบ (ต้องเป็นตัวเลข 9 หลัก)',
    searchTerm: 'สายไฟ'
  });
});

test('QR ที่เดือนผิดส่งข้อความเฉพาะและไม่เขียนทับคำค้นเดิม', () => {
  assert.deepEqual(resolveProductQrScan('136615041', 'สายไฟ'), {
    ok: false,
    error: 'เดือนในรหัสไม่ถูกต้อง',
    searchTerm: 'สายไฟ'
  });
});

test('ยืนยันผลค้นหาด้วย item_id ที่ตรงตัว ไม่ใช่ contains', () => {
  const products = [{ sku: '15041' }, { sku: '91504' }];

  assert.equal(hasExactScannedProduct(products, '15041'), true);
  assert.equal(hasExactScannedProduct(products, '1504'), false);
});

test('รับเฉพาะ response ของรอบสแกนปัจจุบันและบริบทเดิม', () => {
  const pendingScan = { itemId: '15041', version: 2 };
  const currentContext = { searchTerm: '15041', groupFilter: '', lowStockOnly: false };

  assert.equal(classifyScanResponse(pendingScan, 2, currentContext), 'current');
  assert.equal(classifyScanResponse(pendingScan, 1, currentContext), 'ignore');
  assert.equal(classifyScanResponse(null, 2, currentContext), 'ignore');
});

test('ยกเลิกผลสแกนเมื่อคำค้นหรือตัวกรองเปลี่ยนก่อน response กลับมา', () => {
  const pendingScan = { itemId: '15041', version: 2 };

  assert.equal(classifyScanResponse(pendingScan, 2, {
    searchTerm: 'สายไฟ', groupFilter: '', lowStockOnly: false
  }), 'cancelled');
  assert.equal(classifyScanResponse(pendingScan, 2, {
    searchTerm: '15041', groupFilter: '15', lowStockOnly: false
  }), 'cancelled');
  assert.equal(classifyScanResponse(pendingScan, 2, {
    searchTerm: '15041', groupFilter: '', lowStockOnly: true
  }), 'cancelled');
});
