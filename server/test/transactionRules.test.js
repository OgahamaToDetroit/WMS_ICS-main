// เทสต์แบบเบา (node --test) เฉพาะ "กติกา/ล่าม" ของเส้น transactions ที่ database บังคับเองไม่ได้
// — ไม่ต้องต่อ database เพราะแยกไว้เป็น pure function ใน utils/transactionRules.js
// รัน: npm test (ในโฟลเดอร์ server/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateOutboundItems,
  canMarkPickedUp,
  docTypeToTxType,
  deriveDocStatus,
  deriveItemStatus,
  mapRequestItem,
  mapReceiveItem,
  mapDocumentToTransaction,
  resolveOutcome,
  parseIsoDate,
  buildTransactionWhere
} from '../utils/transactionRules.js';

// ---------------------------------------------------------------------------
// aggregateOutboundItems — server ต้องรวม SKU ซ้ำก่อนตรวจสต็อก ห้ามเชื่อว่า UI จะกันให้เสมอ
// ---------------------------------------------------------------------------
test('aggregateOutboundItems: รวม SKU ซ้ำก่อนเช็คสต็อก และคงลำดับครั้งแรกที่พบ', () => {
  assert.deepEqual(aggregateOutboundItems([
    { productId: '01001', quantity: 8 },
    { sku: '02001', quantity: 2 },
    { sku: '01001', quantity: 8 }
  ]), {
    ok: true,
    lines: [
      { itemId: '01001', reqQty: 16 },
      { itemId: '02001', reqQty: 2 }
    ]
  });
});

test('aggregateOutboundItems: ปฏิเสธลิสต์ว่าง/รหัสว่าง/จำนวนไม่ถูกต้อง', () => {
  assert.deepEqual(aggregateOutboundItems([]), { ok: false, error: 'ไม่มีรายการสินค้า' });
  assert.equal(aggregateOutboundItems([{ sku: '', quantity: 1 }]).ok, false);
  assert.equal(aggregateOutboundItems([{ sku: '01001', quantity: 0 }]).ok, false);
  assert.equal(aggregateOutboundItems([{ sku: '01001', quantity: 1.5 }]).ok, false);
});

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
    {
      item_id: '02001',
      qty_requested: 8,
      qty_confirmed: null,
      item: { name: 'ปลั๊ก', image_url: null, group_id: '02', group: { group_name: 'อุปกรณ์ไฟฟ้า' } }
    },
    'PENDING'
  );
  assert.deepEqual(item, {
    productId: '02001',
    sku: '02001',
    productName: 'ปลั๊ก',
    imageUrl: '', // NULL → '' ตามทรงเดิม
    groupId: '02',
    groupName: 'อุปกรณ์ไฟฟ้า',
    requestedQty: 8,
    approvedQty: 0,
    status: 'Pending'
  });
});

test('mapReceiveItem: requested = approved = qty_change, status Approved', () => {
  const item = mapReceiveItem({
    item_id: '19001',
    qty_change: 12,
    item: { name: 'สว่าน', image_url: '/u/a.png', group_id: '19', group: { group_name: 'เครื่องมือช่าง' } }
  });
  assert.deepEqual(item, {
    productId: '19001',
    sku: '19001',
    productName: 'สว่าน',
    imageUrl: '/u/a.png',
    groupId: '19',
    groupName: 'เครื่องมือช่าง',
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

// ---------------------------------------------------------------------------
// คิวรอส่งมอบ (DATABASE.md ข้อ 6.14) — เงื่อนไขการกด "บันทึกส่งมอบ" ที่ database บังคับเองไม่ได้
// ---------------------------------------------------------------------------
test('canMarkPickedUp: ISSUE ที่ CONFIRMED และยังไม่เคยกด → กดได้', () => {
  assert.deepEqual(canMarkPickedUp({ doc_type: 'ISSUE', status: 'CONFIRMED', picked_up_at: null }), { ok: true });
});

test('canMarkPickedUp: RECEIVE กดไม่ได้แม้ status=CONFIRMED เหมือนกัน — เช็ค doc_type ด้วยเสมอ', () => {
  const out = canMarkPickedUp({ doc_type: 'RECEIVE', status: 'CONFIRMED', picked_up_at: null });
  assert.equal(out.ok, false);
  assert.equal(out.error, 'รายการนี้ไม่อยู่ในสถานะรอส่งมอบสินค้า');
});

test('canMarkPickedUp: ใบที่ยัง PENDING หรือถูก CANCELLED ไม่อยู่ในคิวรอส่งมอบ', () => {
  assert.equal(canMarkPickedUp({ doc_type: 'ISSUE', status: 'PENDING', picked_up_at: null }).ok, false);
  assert.equal(canMarkPickedUp({ doc_type: 'ISSUE', status: 'CANCELLED', picked_up_at: null }).ok, false);
});

test('canMarkPickedUp: กดซ้ำไม่ได้ — เวลาส่งมอบคือหลักฐาน เขียนทับได้ = ปลอมได้', () => {
  const out = canMarkPickedUp({ doc_type: 'ISSUE', status: 'CONFIRMED', picked_up_at: new Date() });
  assert.equal(out.ok, false);
  assert.equal(out.error, 'รายการนี้บันทึกการส่งมอบไปแล้ว');
});

test('mapDocumentToTransaction: ทรง JSON มี pickedUpAt — NULL คงเป็น null, มีค่าส่งผ่านตามจริง', () => {
  const base = {
    id: 9,
    doc_no: 'ISS-6907-0009',
    doc_type: 'ISSUE',
    status: 'CONFIRMED',
    created_at: new Date('2026-07-10T03:00:00Z'),
    resolved_at: new Date('2026-07-10T04:00:00Z'),
    requestItems: [{ item_id: '02001', qty_requested: 2, qty_confirmed: 2, item: { name: 'x', image_url: null } }]
  };
  assert.equal(mapDocumentToTransaction({ ...base, picked_up_at: null }).pickedUpAt, null);
  const pickedUp = new Date('2026-07-10T05:00:00Z');
  assert.equal(mapDocumentToTransaction({ ...base, picked_up_at: pickedUp }).pickedUpAt, pickedUp);
});

// ---------------------------------------------------------------------------
// parseIsoDate — ห้ามปล่อย Invalid Date เข้า Prisma where (จะ throw ตอน query จริง)
// ---------------------------------------------------------------------------
test('parseIsoDate: ISO ถูกต้อง → Date ตรงค่า', () => {
  const d = parseIsoDate('2026-07-11T00:00:00.000Z');
  assert.equal(d.toISOString(), '2026-07-11T00:00:00.000Z');
});

test('parseIsoDate: ว่าง/null/เพี้ยน → null', () => {
  assert.equal(parseIsoDate(''), null);
  assert.equal(parseIsoDate(null), null);
  assert.equal(parseIsoDate(undefined), null);
  assert.equal(parseIsoDate('abc'), null);
});

// ---------------------------------------------------------------------------
// buildTransactionWhere — สเปคพอร์ตจาก reference getFullTransactions (DATABASE.md ข้อ 6.17)
// ---------------------------------------------------------------------------
const ACTIVE_WHERE = {
  OR: [{ status: 'PENDING' }, { doc_type: 'ISSUE', status: 'CONFIRMED', picked_up_at: null }]
};

test('buildTransactionWhere: ไม่มี query เลย → {} (ไม่กรอง = พฤติกรรมเดิม)', () => {
  assert.deepEqual(buildTransactionWhere({}), {});
  assert.deepEqual(buildTransactionWhere(), {});
});

test('buildTransactionWhere: view=active → ใบค้าง (PENDING หรือ ISSUE+CONFIRMED+ยังไม่ส่งมอบ)', () => {
  assert.deepEqual(buildTransactionWhere({ view: 'active' }), ACTIVE_WHERE);
});

test('buildTransactionWhere: view=dashboard เท่ากับ view=active', () => {
  assert.deepEqual(buildTransactionWhere({ view: 'dashboard' }), ACTIVE_WHERE);
});

test('buildTransactionWhere: view ค่าขยะ → {} (ไม่ตีความเป็น active)', () => {
  assert.deepEqual(buildTransactionWhere({ view: 'all' }), {});
});

test('buildTransactionWhere: since อย่างเดียว → TIME มีแค่ gte ทั้งสองก้อน', () => {
  const since = '2026-07-01T00:00:00.000Z';
  const where = buildTransactionWhere({ since });
  assert.deepEqual(where, {
    OR: [
      { resolved_at: { gte: new Date(since) } },
      { resolved_at: null, created_at: { gte: new Date(since) } }
    ]
  });
});

test('buildTransactionWhere: until อย่างเดียว → TIME มีแค่ lt ทั้งสองก้อน', () => {
  const until = '2026-08-01T00:00:00.000Z';
  const where = buildTransactionWhere({ until });
  assert.deepEqual(where, {
    OR: [
      { resolved_at: { lt: new Date(until) } },
      { resolved_at: null, created_at: { lt: new Date(until) } }
    ]
  });
});

test('buildTransactionWhere: since+until → ครบทั้ง gte และ lt', () => {
  const since = '2026-07-01T00:00:00.000Z';
  const until = '2026-08-01T00:00:00.000Z';
  const where = buildTransactionWhere({ since, until });
  assert.deepEqual(where, {
    OR: [
      { resolved_at: { gte: new Date(since), lt: new Date(until) } },
      { resolved_at: null, created_at: { gte: new Date(since), lt: new Date(until) } }
    ]
  });
});

test('buildTransactionWhere: view=active + since → {OR:[ACTIVE,TIME]} (ใบค้างไม่โดนช่วงเวลาตัด)', () => {
  const since = '2026-07-01T00:00:00.000Z';
  const where = buildTransactionWhere({ view: 'active', since });
  assert.deepEqual(where, {
    OR: [
      ACTIVE_WHERE,
      { OR: [{ resolved_at: { gte: new Date(since) } }, { resolved_at: null, created_at: { gte: new Date(since) } }] }
    ]
  });
});

test('buildTransactionWhere: since เป็น string เพี้ยน → เหมือนไม่ได้ส่ง (กัน Prisma throw)', () => {
  assert.deepEqual(buildTransactionWhere({ since: 'abc' }), {});
});
