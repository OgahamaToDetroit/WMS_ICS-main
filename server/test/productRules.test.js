// เทสต์แบบเบา (node --test) เฉพาะ "กติกาที่ database บังคับเองไม่ได้" ของเส้น products
// — ไม่ต้องต่อ database เพราะกติกาถูกแยกไว้เป็น pure function ใน utils/productRules.js
// รัน: npm test (ในโฟลเดอร์ server/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDocNoPrefix,
  buildNextDocNo,
  buildNextItemId,
  buildStockMap,
  computeStatus,
  mapItemToProduct,
  parseMinStock,
  stockOf
} from '../utils/productRules.js';

// ---------------------------------------------------------------------------
// กติกา: min_stock เป็น NULL = ยังไม่ตั้งเกณฑ์ → ห้ามขึ้นป้าย Low Stock เด็ดขาด (ข้อ 6.8)
// ---------------------------------------------------------------------------

test('min_stock NULL: มีของ = Active เสมอ ไม่มีวันเป็น Low Stock', () => {
  assert.equal(computeStatus(5, null), 'Active');
  assert.equal(computeStatus(0.25, null), 'Active');
  assert.equal(computeStatus(9999, undefined), 'Active');
});

test('min_stock NULL: ของหมด/ติดลบ ยังต้องเป็น Out of Stock (คนละเรื่องกับ Low Stock)', () => {
  assert.equal(computeStatus(0, null), 'Out of Stock');
  assert.equal(computeStatus(-3, null), 'Out of Stock');
});

test('min_stock ตั้งแล้ว: เท่าเกณฑ์พอดีถือว่า Low Stock (พฤติกรรมเดิมของระบบ)', () => {
  assert.equal(computeStatus(10, 10), 'Low Stock');
  assert.equal(computeStatus(11, 10), 'Active');
  assert.equal(computeStatus(3, 10), 'Low Stock');
});

test('min_stock = 0 คือ "ตั้งเกณฑ์แล้วที่ศูนย์" ไม่ใช่ "ยังไม่ตั้ง" — มีของแล้วต้องเป็น Active', () => {
  assert.equal(computeStatus(1, 0), 'Active');
  assert.equal(computeStatus(0, 0), 'Out of Stock');
});

test('mapItemToProduct: ปล่อย NULL ผ่านตามจริง ห้ามเสก 10/0 ทับ', () => {
  const product = mapItemToProduct(
    {
      item_id: '02001',
      name: 'ปลั๊ก XT30',
      unit: null,
      vendor: null,
      latest_cost: null, // ไม่รู้ราคา — ต้องไม่กลายเป็น 0
      min_stock: null, // ยังไม่ตั้งเกณฑ์ — ต้องไม่กลายเป็น 10
      image_url: null,
      group: { group_name: 'อุปกรณ์ไฟฟ้า' }
    },
    7
  );
  assert.equal(product.minStock, null);
  assert.equal(product.latestCost, null);
  assert.equal(product.status, 'Active');
  assert.equal(product.warning, null);
  // ทรง JSON เดิมของหน้า React: ช่องข้อความว่างเป็น '' ไม่ใช่ null
  assert.equal(product.unit, '');
  assert.equal(product.vendor, '');
  assert.equal(product.imageUrl, '');
  assert.equal(product.groupName, 'อุปกรณ์ไฟฟ้า');
  assert.equal(product.id, '02001');
  assert.equal(product.sku, '02001');
});

test('mapItemToProduct: ยอดติดลบต้องติดป้าย warning แบบเดียวกับระบบเดิม', () => {
  const product = mapItemToProduct(
    { item_id: '19001', name: 'x', group: { group_name: 'g' }, min_stock: 5 },
    -2
  );
  assert.equal(product.warning, 'Negative stock');
  assert.equal(product.status, 'Out of Stock');
});

// ---------------------------------------------------------------------------
// กติกา: ยอดคงเหลือ = SUM(qty_change) และ "ไม่มีแถว = 0" ห้ามเป็น NULL/undefined
// (สินค้า 1,803 จาก 2,382 ตัว ณ วันส่งมอบ ไม่มีแถว transaction เลย)
// ---------------------------------------------------------------------------

test('ยอดคงเหลือ: สินค้าที่ไม่มีแถว transaction ต้องได้ 0 ไม่ใช่ undefined', () => {
  const stockMap = buildStockMap([
    { item_id: '02001', _sum: { qty_change: 12.5 } }
  ]);
  assert.equal(stockOf(stockMap, '02001'), 12.5);
  assert.equal(stockOf(stockMap, '19999'), 0); // ไม่อยู่ในผล groupBy เลย
});

test('ยอดคงเหลือ: ผลรวมที่เป็น null จากฐาน ต้องถูกถือเป็น 0', () => {
  const stockMap = buildStockMap([{ item_id: '02002', _sum: { qty_change: null } }]);
  assert.equal(stockOf(stockMap, '02002'), 0);
});

// ---------------------------------------------------------------------------
// กติกา: ออกรหัสสินค้า MAX+1 ในกลุ่มเท่านั้น ห้ามถมช่องว่าง เพดาน 999 (ข้อ 6.9)
// ---------------------------------------------------------------------------

test('ออกรหัส: MAX+1 แม้กลุ่มมีช่องว่าง — ช่องว่างคือรหัสที่เผาทิ้งแล้ว ห้ามนำกลับมาใช้', () => {
  // สถานการณ์จริงของกลุ่ม 19: มีของ 116 ตัวแต่เลขวิ่งถึง 218 → ตัวถัดไปต้องเป็น 219
  assert.equal(buildNextItemId('19', '19218'), '19219');
});

test('ออกรหัส: กลุ่มว่างเริ่มที่ 001 พร้อมเลขศูนย์นำหน้าครบ 5 หลัก', () => {
  assert.equal(buildNextItemId('02', null), '02001');
});

test('ออกรหัส: เกินเพดาน 999 ต้องปฏิเสธ (คืน null) ไม่ใช่วนกลับไปเลขต้น', () => {
  assert.equal(buildNextItemId('10', '10999'), null);
  assert.equal(buildNextItemId('10', '10998'), '10999'); // ตัวสุดท้ายยังออกได้
});

// ---------------------------------------------------------------------------
// กติกา: doc_no แอปออกเลขเอง รูปแบบ REC-6907-0001 (ปี พ.ศ. 2 หลัก + เดือน + วิ่ง 4 หลัก)
// ---------------------------------------------------------------------------

test('doc_no: prefix คิดปี พ.ศ. + เดือนถูกต้อง', () => {
  const july2026 = new Date(2026, 6, 8); // ก.ค. 2026 = พ.ศ. 2569
  assert.equal(buildDocNoPrefix('RECEIVE', july2026), 'REC-6907-');
  assert.equal(buildDocNoPrefix('ISSUE', july2026), 'ISS-6907-');
  const december = new Date(2026, 11, 31);
  assert.equal(buildDocNoPrefix('RECEIVE', december), 'REC-6912-');
});

test('doc_no: เลขวิ่ง MAX+1 ในรอบเดือน เริ่ม 0001 เมื่อยังไม่มีใบ', () => {
  assert.equal(buildNextDocNo('REC-6907-', null), 'REC-6907-0001');
  assert.equal(buildNextDocNo('REC-6907-', 'REC-6907-0012'), 'REC-6907-0013');
});

// ---------------------------------------------------------------------------
// กติกา: ห้ามทุกชั้นแปลงค่าว่างของ min_stock เป็นตัวเลขเงียบๆ (ข้อ 6.8)
// ---------------------------------------------------------------------------

test('parseMinStock: ว่าง/ไม่ส่ง = NULL (ยังไม่ตั้งเกณฑ์) — ระวังกับดัก Number(null) === 0', () => {
  assert.deepEqual(parseMinStock(''), { ok: true, value: null });
  assert.deepEqual(parseMinStock(null), { ok: true, value: null });
  assert.deepEqual(parseMinStock(undefined), { ok: true, value: null });
});

test('parseMinStock: 0 คือเกณฑ์จริง ไม่ใช่ค่าว่าง และทศนิยมใช้ได้ (ของนับเป็นเมตร)', () => {
  assert.deepEqual(parseMinStock(0), { ok: true, value: 0 });
  assert.deepEqual(parseMinStock('0'), { ok: true, value: 0 });
  assert.deepEqual(parseMinStock('2.5'), { ok: true, value: 2.5 });
});

test('parseMinStock: ค่าติดลบ/ไม่ใช่ตัวเลข ต้องถูกปฏิเสธ ไม่ใช่เงียบๆ แทนด้วย default', () => {
  assert.equal(parseMinStock(-1).ok, false);
  assert.equal(parseMinStock('abc').ok, false);
  assert.equal(parseMinStock(Infinity).ok, false);
});
