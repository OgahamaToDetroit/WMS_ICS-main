// เทสต์แบบเบา (node --test) เฉพาะ "กติกา/ล่าม" ของเส้น transactions ที่ database บังคับเองไม่ได้
// — ไม่ต้องต่อ database เพราะแยกไว้เป็น pure function ใน utils/transactionRules.js
// รัน: npm test (ในโฟลเดอร์ server/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  docTypeToTxType,
  deriveDocStatus,
  deriveItemStatus,
  mapRequestItem,
  mapReceiveItem,
  mapDocumentToTransaction,
  resolveOutcome
} from '../utils/transactionRules.js';

// ---------------------------------------------------------------------------
// enum ชนิดใบ: RECEIVE→INBOUND, ISSUE→OUTBOUND (หน้าเว็บกรอง/แสดงด้วยค่าเดิม)
// ---------------------------------------------------------------------------
test('docTypeToTxType: RECEIVE→INBOUND, ISSUE→OUTBOUND', () => {
  assert.equal(docTypeToTxType('RECEIVE'), 'INBOUND');
  assert.equal(docTypeToTxType('ISSUE'), 'OUTBOUND');
});

// ---------------------------------------------------------------------------
// สถานะใบ 3 ค่า → 5 ค่า — จุดที่ผิดแล้วเจ็บสุด (ป้ายผิด = คนคลังเข้าใจสถานะใบผิด)
// ---------------------------------------------------------------------------
test('deriveDocStatus: RECEIVE = Approved เสมอ (รับเข้าจบขั้นเดียว ไม่มี partial/reject)', () => {
  assert.equal(deriveDocStatus({ doc_type: 'RECEIVE', status: 'CONFIRMED' }), 'Approved');
});

test('deriveDocStatus: ISSUE PENDING = Pending (ยังรออนุมัติ)', () => {
  assert.equal(deriveDocStatus({ doc_type: 'ISSUE', status: 'PENDING' }, []), 'Pending');
});

test('deriveDocStatus: ISSUE CONFIRMED ครบทุกบรรทัด = Approved', () => {
  const items = [
    { qty_requested: 10, qty_confirmed: 10 },
    { qty_requested: 5, qty_confirmed: 5 }
  ];
  assert.equal(deriveDocStatus({ doc_type: 'ISSUE', status: 'CONFIRMED' }, items), 'Approved');
});

test('deriveDocStatus: ISSUE CONFIRMED ให้ไม่ครบบางบรรทัด = Partial', () => {
  const items = [
    { qty_requested: 10, qty_confirmed: 7 }, // ให้ไม่ครบ
    { qty_requested: 5, qty_confirmed: 5 }
  ];
  assert.equal(deriveDocStatus({ doc_type: 'ISSUE', status: 'CONFIRMED' }, items), 'Partial');
});

test('deriveDocStatus: ISSUE CANCELLED โดยผู้ขอเอง (resolved_by == requested_by) = Cancelled', () => {
  const doc = { doc_type: 'ISSUE', status: 'CANCELLED', requested_by: 3, resolved_by: 3 };
  assert.equal(deriveDocStatus(doc, []), 'Cancelled');
});

test('deriveDocStatus: ISSUE CANCELLED โดยคนคลัง (resolved_by != requested_by) = Rejected', () => {
  // รวมเคส "อนุมัติ 0 ทุกบรรทัด" ที่ถูกบันทึกเป็น CANCELLED + note โดยคนคลัง (DATABASE.md ข้อ 6.3)
  const doc = { doc_type: 'ISSUE', status: 'CANCELLED', requested_by: 3, resolved_by: 1 };
  assert.equal(deriveDocStatus(doc, []), 'Rejected');
});

// ---------------------------------------------------------------------------
// สถานะรายบรรทัด
// ---------------------------------------------------------------------------
test('deriveItemStatus: PENDING→Pending, ครบ→Approved, บางส่วน→Partial, ศูนย์→Rejected', () => {
  assert.equal(deriveItemStatus(10, null, 'PENDING'), 'Pending');
  assert.equal(deriveItemStatus(10, 10, 'CONFIRMED'), 'Approved');
  assert.equal(deriveItemStatus(10, 4, 'CONFIRMED'), 'Partial');
  assert.equal(deriveItemStatus(10, 0, 'CONFIRMED'), 'Rejected'); // ถูกตัดเหลือศูนย์ในใบอนุมัติบางส่วน
});

test('deriveItemStatus: ใบ CANCELLED ลูกทุกบรรทัดเป็น Rejected (approvedQty=0)', () => {
  assert.equal(deriveItemStatus(10, null, 'CANCELLED'), 'Rejected');
});

// ---------------------------------------------------------------------------
// แปลงรายการ: ISSUE (จาก request item) vs RECEIVE (จาก transaction)
// ---------------------------------------------------------------------------
test('mapRequestItem: ทรง item เดิมครบ + approvedQty=0 ตอนยังไม่ยืนยัน', () => {
  const item = mapRequestItem(
    { item_id: '02001', qty_requested: 8, qty_confirmed: null, item: { name: 'ปลั๊ก', image_url: null } },
    'PENDING'
  );
  assert.deepEqual(item, {
    productId: '02001',
    sku: '02001',
    productName: 'ปลั๊ก',
    imageUrl: '', // NULL → '' ตามทรงเดิม
    requestedQty: 8,
    approvedQty: 0,
    status: 'Pending'
  });
});

test('mapReceiveItem: requested = approved = qty_change, status Approved', () => {
  const item = mapReceiveItem({ item_id: '19001', qty_change: 12, item: { name: 'สว่าน', image_url: '/u/a.png' } });
  assert.deepEqual(item, {
    productId: '19001',
    sku: '19001',
    productName: 'สว่าน',
    imageUrl: '/u/a.png',
    requestedQty: 12,
    approvedQty: 12,
    status: 'Approved'
  });
});

// ---------------------------------------------------------------------------
// ล่ามหลัก: StockDocument → transaction ทรงเดิม (ครบทุก field ที่ frontend อ่าน)
// ---------------------------------------------------------------------------
test('mapDocumentToTransaction: ใบ ISSUE ยัง PENDING — ผู้ขอ/project/รายการครบ', () => {
  const doc = {
    id: 42,
    doc_no: 'ISS-6907-0001',
    doc_type: 'ISSUE',
    status: 'PENDING',
    note: null,
    project: 'ซ่อมสายพาน A',
    created_at: new Date('2026-07-09T03:00:00Z'),
    resolved_at: null,
    requested_by: 3,
    resolved_by: null,
    requester: { username: 'operator1' },
    resolver: null,
    creator: null,
    requestItems: [
      { item_id: '02001', qty_requested: 8, qty_confirmed: null, item: { name: 'ปลั๊ก', image_url: null } }
    ]
  };
  const tx = mapDocumentToTransaction(doc);
  assert.equal(tx.id, 42);
  assert.equal(tx.transactionId, 'ISS-6907-0001');
  assert.equal(tx.type, 'OUTBOUND');
  assert.equal(tx.status, 'Pending');
  assert.equal(tx.requesterUsername, 'operator1');
  assert.equal(tx.adminUsername, null); // ยังไม่มีคนปิดใบ
  assert.equal(tx.project, 'ซ่อมสายพาน A');
  assert.equal(tx.adminMessage, null);
  assert.equal(tx.resolvedDate, null);
  assert.equal(tx.items.length, 1);
  assert.equal(tx.items[0].status, 'Pending');
});

test('mapDocumentToTransaction: ใบ ISSUE CONFIRMED บางส่วน — Partial + ผู้ปิด + เหตุผล', () => {
  const doc = {
    id: 43,
    doc_no: 'ISS-6907-0002',
    doc_type: 'ISSUE',
    status: 'CONFIRMED',
    note: 'สต็อกไม่พอ จ่ายได้บางส่วน',
    project: 'งาน B',
    created_at: new Date('2026-07-09T03:00:00Z'),
    resolved_at: new Date('2026-07-09T05:00:00Z'),
    requested_by: 3,
    resolved_by: 1,
    requester: { username: 'operator1' },
    resolver: { username: 'admin' },
    creator: null,
    requestItems: [
      { item_id: '02001', qty_requested: 10, qty_confirmed: 6, item: { name: 'ปลั๊ก', image_url: null } }
    ]
  };
  const tx = mapDocumentToTransaction(doc);
  assert.equal(tx.status, 'Partial');
  assert.equal(tx.adminUsername, 'admin');
  assert.equal(tx.adminMessage, 'สต็อกไม่พอ จ่ายได้บางส่วน');
  assert.equal(tx.items[0].requestedQty, 10);
  assert.equal(tx.items[0].approvedQty, 6);
  assert.equal(tx.items[0].status, 'Partial');
});

test('mapDocumentToTransaction: ใบ RECEIVE — INBOUND/Approved, ผู้สร้าง = ผู้ขอ = ผู้ปิด, รายการจาก transaction', () => {
  const doc = {
    id: 7,
    doc_no: 'REC-6907-0003',
    doc_type: 'RECEIVE',
    status: 'CONFIRMED',
    note: 'ยอดเริ่มต้นจากการสร้างสินค้าใหม่',
    project: null,
    created_at: new Date('2026-07-09T03:00:00Z'),
    resolved_at: null,
    requested_by: null,
    resolved_by: null,
    creator: { username: 'admin' },
    requester: null,
    resolver: null,
    requestItems: [], // RECEIVE ไม่มีคำขอ
    transactions: [{ item_id: '01262', qty_change: 5, item: { name: 'สินค้าใหม่', image_url: null } }]
  };
  const tx = mapDocumentToTransaction(doc);
  assert.equal(tx.type, 'INBOUND');
  assert.equal(tx.status, 'Approved');
  assert.equal(tx.requesterUsername, 'admin');
  assert.equal(tx.adminUsername, 'admin');
  assert.equal(tx.items.length, 1);
  assert.equal(tx.items[0].requestedQty, 5);
  assert.equal(tx.items[0].approvedQty, 5);
  assert.equal(tx.items[0].status, 'Approved');
});

// ---------------------------------------------------------------------------
// resolveOutcome: ประมวลผลอนุมัติ/ปฏิเสธ (logic bug-density สูงสุดของเส้นนี้)
// ---------------------------------------------------------------------------
const line = (over = {}) => ({ itemId: '02001', sku: '02001', qtyRequested: 10, qtyApproved: 10, currentStock: 100, ...over });

test('resolveOutcome: อนุมัติครบทุกบรรทัด → CONFIRMED, ไม่ต้องมีเหตุผล', () => {
  const out = resolveOutcome({ action: 'APPROVE', lines: [line({ qtyApproved: 10 })] });
  assert.equal(out.ok, true);
  assert.equal(out.docStatus, 'CONFIRMED');
  assert.deepEqual(out.lines, [{ itemId: '02001', qtyConfirmed: 10 }]);
});

test('resolveOutcome: อนุมัติบางส่วนต้องมีเหตุผล — ไม่มี = error, มี = CONFIRMED', () => {
  const noMsg = resolveOutcome({ action: 'APPROVE', lines: [line({ qtyApproved: 6 })] });
  assert.equal(noMsg.ok, false);
  assert.match(noMsg.error, /ไม่ครบ/);
  const withMsg = resolveOutcome({ action: 'APPROVE', message: 'สต็อกไม่พอ', lines: [line({ qtyApproved: 6 })] });
  assert.equal(withMsg.ok, true);
  assert.equal(withMsg.docStatus, 'CONFIRMED');
  assert.equal(withMsg.lines[0].qtyConfirmed, 6);
});

test('resolveOutcome: อนุมัติ 0 ทุกบรรทัด → CANCELLED (ห้ามเป็น CONFIRMED ที่ไม่มี transaction)', () => {
  const out = resolveOutcome({ action: 'APPROVE', message: 'ของไม่มีจริง', lines: [line({ qtyApproved: 0 })] });
  assert.equal(out.ok, true);
  assert.equal(out.docStatus, 'CANCELLED'); // แม้กด APPROVE แต่ให้ 0 หมด = ยกเลิก
  assert.equal(out.lines[0].qtyConfirmed, 0);
});

test('resolveOutcome: อนุมัติเกินจำนวนที่ขอ → reject พร้อม error (ไม่ clamp เงียบ)', () => {
  const out = resolveOutcome({ action: 'APPROVE', lines: [line({ qtyApproved: 15 })] });
  assert.equal(out.ok, false);
  assert.match(out.error, /เกินจำนวนที่ขอ/);
});

test('resolveOutcome: อนุมัติเกินสต็อกที่มีจริง → error', () => {
  const out = resolveOutcome({ action: 'APPROVE', lines: [line({ qtyApproved: 8, currentStock: 5 })] });
  assert.equal(out.ok, false);
  assert.match(out.error, /คงเหลือไม่พอ/);
});

test('resolveOutcome: จำนวนไม่ใช่จำนวนเต็ม/ติดลบ → error', () => {
  assert.equal(resolveOutcome({ action: 'APPROVE', lines: [line({ qtyApproved: 2.5 })] }).ok, false);
  assert.equal(resolveOutcome({ action: 'APPROVE', lines: [line({ qtyApproved: -1 })] }).ok, false);
});

test('resolveOutcome: REJECT ต้องมีเหตุผล — ไม่มี = error, มี = CANCELLED ทุกบรรทัด 0', () => {
  assert.equal(resolveOutcome({ action: 'REJECT', lines: [line()] }).ok, false);
  const out = resolveOutcome({ action: 'REJECT', message: 'เอกสารไม่ครบ', lines: [line(), line({ itemId: '02002', sku: '02002' })] });
  assert.equal(out.ok, true);
  assert.equal(out.docStatus, 'CANCELLED');
  assert.deepEqual(out.lines, [{ itemId: '02001', qtyConfirmed: 0 }, { itemId: '02002', qtyConfirmed: 0 }]);
});

test('resolveOutcome: หลายบรรทัด บางตัวครบ บางตัวได้บางส่วน → Partial (CONFIRMED) + ต้องมีเหตุผล', () => {
  const lines = [line({ itemId: 'A', sku: 'A', qtyApproved: 10 }), line({ itemId: 'B', sku: 'B', qtyApproved: 3 })];
  const out = resolveOutcome({ action: 'APPROVE', message: 'B มีไม่พอ', lines });
  assert.equal(out.ok, true);
  assert.equal(out.docStatus, 'CONFIRMED'); // มีคนได้ของ → CONFIRMED (deriveDocStatus จะแปลงเป็น Partial ตอนแสดง)
  assert.deepEqual(out.lines, [{ itemId: 'A', qtyConfirmed: 10 }, { itemId: 'B', qtyConfirmed: 3 }]);
});

test('resolveOutcome: action/ลิสต์ผิด → error ไม่ระเบิด', () => {
  assert.equal(resolveOutcome({ action: 'FOO', lines: [line()] }).ok, false);
  assert.equal(resolveOutcome({ action: 'APPROVE', lines: [] }).ok, false);
});
