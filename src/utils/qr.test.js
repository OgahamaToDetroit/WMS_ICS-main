import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWarehouseQr } from './qr.js';

test('parse QR ปกติเป็น MMYY และ itemId 5 หลักท้าย', () => {
  assert.deepEqual(parseWarehouseQr('116615041'), {
    ok: true,
    raw: '116615041',
    itemId: '15041',
    month: '11',
    yearBe: 2566,
    yearCe: 2023
  });
});

test('คงเลขศูนย์นำหน้าของ itemId ไว้เป็น string', () => {
  const result = parseWarehouseQr('066802001');

  assert.equal(result.ok, true);
  assert.equal(result.itemId, '02001');
  assert.equal(typeof result.itemId, 'string');
});

test('trim ช่องว่างหัวท้ายที่ติดมาจากเครื่องสแกน', () => {
  assert.deepEqual(parseWarehouseQr(' 116615041 \r\n'), {
    ok: true,
    raw: '116615041',
    itemId: '15041',
    month: '11',
    yearBe: 2566,
    yearCe: 2023
  });
});

test('QR เดิมที่สแกนซ้ำยัง parse ได้ตามปกติ', () => {
  const expected = {
    ok: true,
    raw: '116615041',
    itemId: '15041',
    month: '11',
    yearBe: 2566,
    yearCe: 2023
  };

  assert.deepEqual(parseWarehouseQr('116615041'), expected);
  assert.deepEqual(parseWarehouseQr('116615041'), expected);
});

test('ปฏิเสธรหัสที่สั้นหรือยาวกว่า 9 หลัก', () => {
  for (const raw of ['11661504', '1166150411']) {
    assert.deepEqual(parseWarehouseQr(raw), {
      ok: false,
      error: 'รหัสไม่ถูกรูปแบบ (ต้องเป็นตัวเลข 9 หลัก)'
    });
  }
});

test('ปฏิเสธรหัสที่มีอักขระอื่นปน', () => {
  for (const raw of ['11661504A', '1166-15041', '']) {
    assert.deepEqual(parseWarehouseQr(raw), {
      ok: false,
      error: 'รหัสไม่ถูกรูปแบบ (ต้องเป็นตัวเลข 9 หลัก)'
    });
  }
});

test('ปฏิเสธเดือนที่อยู่นอกช่วง 01 ถึง 12', () => {
  for (const raw of ['006615041', '136615041']) {
    assert.deepEqual(parseWarehouseQr(raw), {
      ok: false,
      error: 'เดือนในรหัสไม่ถูกต้อง'
    });
  }
});

test('ยอมรับเดือนขอบเขต 01 และ 12', () => {
  for (const raw of ['016615041', '126615041']) {
    const result = parseWarehouseQr(raw);

    assert.equal(result.ok, true);
    assert.equal(result.month, raw.slice(0, 2));
    assert.equal(result.itemId, '15041');
  }
});
