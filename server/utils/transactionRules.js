// กติกาเส้น transactions ที่ database บังคับเองไม่ได้ + ล่ามแปลงโครงสร้างฐานใหม่ → ทรง JSON เดิม
// แยกเป็น pure function เพื่อเทสต์ด้วย node --test โดยไม่ต้องต่อ database (แนวเดียวกับ product/authRules)
//
// โครงสร้างเปลี่ยนทรงจริง (ไม่ใช่แค่ย้ายบ้าน):
//   ฐานเก่า: wms_transactions (หัวใบ flat) + wms_transaction_items — สถานะ 5 ค่าเก็บตรงๆ
//   ฐานใหม่: StockDocument (หัวใบ) + StockRequestItem (คำขอตอน PENDING) + StockTransaction (บัญชีจริง)
// ล่ามนี้แปลง enum ไปกลับให้หน้าเว็บไม่รู้สึกว่าเปลี่ยน:
//   doc_type RECEIVE/ISSUE  ↔  type INBOUND/OUTBOUND
//   status PENDING/CONFIRMED/CANCELLED (3 ค่า)  →  Pending/Approved/Partial/Rejected/Cancelled (5 ค่า)
// ที่มา: DATABASE.md ข้อ 6 (ข้อ 1,3) + Newdatabase/docs/data_dictionary.md §6, §6.1

// ⚠️ ต้อง include requestItems ทุกครั้งที่ query StockDocument แล้วจะเอาไป mapDocumentToTransaction —
// ไม่งั้นใบ ISSUE ที่ CONFIRMED จะกลายเป็น 'Partial' + items ว่างเงียบๆ (ดูคำเตือนใน deriveDocStatus ด้านล่าง)
// อยู่ตรงนี้ (ไม่ใช่ในตัว controller ใดตัวหนึ่ง) เพราะมีมากกว่า 1 controller ต้องใช้ pattern เดียวกัน
// (transactionController: list/history · productController: dashboard activities) — แชร์ไว้กันลืม include ซ้ำ
export const DOCUMENT_INCLUDE = {
  requester: { select: { username: true } },
  resolver: { select: { username: true } },
  creator: { select: { username: true } },
  requestItems: {
    include: { item: { select: { name: true, image_url: true, group_id: true, group: { select: { group_name: true } } } } },
    orderBy: { id: 'asc' }
  },
  transactions: {
    include: { item: { select: { name: true, image_url: true, group_id: true, group: { select: { group_name: true } } } } },
    orderBy: { id: 'asc' }
  }
};

// ---------------------------------------------------------------------------
// enum ชนิดใบ: หัวใบใหม่ → ประเภทที่หน้าเว็บรู้จัก
// ---------------------------------------------------------------------------
export const docTypeToTxType = (docType) => (docType === 'RECEIVE' ? 'INBOUND' : 'OUTBOUND');

// ---------------------------------------------------------------------------
// เตรียมรายการใบเบิกจาก client: ตรวจรูปทรง + รวม SKU ซ้ำก่อน controller เช็คสต็อก
// UI ปกติไม่สร้าง SKU ซ้ำ แต่ API ต้องคุมกติกาเอง — ไม่เช่นนั้น A=8 + A=8 จะผ่านการ
// เช็คทีละบรรทัดเมื่อสต็อกมี 10 แล้วสร้างคำขอรวม 16 ได้
// คืนลำดับตามครั้งแรกที่พบ SKU เพื่อให้รายการในใบยังเรียงเหมือนที่ผู้ใช้ส่งมา
// ---------------------------------------------------------------------------
export const aggregateOutboundItems = (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: 'ไม่มีรายการสินค้า' };
  }

  const quantitiesByItem = new Map();
  for (const item of items) {
    const itemId = String(item?.productId || item?.sku || '').trim();
    const reqQty = Number(item?.quantity);
    if (!itemId || !Number.isInteger(reqQty) || reqQty <= 0) {
      return { ok: false, error: 'จำนวนเบิกไม่ถูกต้อง' };
    }

    const combinedQty = (quantitiesByItem.get(itemId) ?? 0) + reqQty;
    if (!Number.isSafeInteger(combinedQty)) {
      return { ok: false, error: 'จำนวนเบิกไม่ถูกต้อง' };
    }
    quantitiesByItem.set(itemId, combinedQty);
  }

  return {
    ok: true,
    lines: [...quantitiesByItem].map(([itemId, reqQty]) => ({ itemId, reqQty }))
  };
};

// ---------------------------------------------------------------------------
// สถานะใบ: 3 ค่าของฐานใหม่ → 5 ค่าที่หน้าเว็บเดิมใช้ (คำนวณตอนแสดงผล ไม่เก็บใน DB)
// ป้าย "ยกเลิก" vs "ปฏิเสธ" แยกด้วย resolved_by เทียบ requested_by (DATABASE.md ข้อ 6.3):
//   ผู้ขอถอนเอง (resolved_by == requested_by) = ยกเลิก (Cancelled)
//   คนคลังปิด/ตัดจบ (resolved_by != requested_by) = ปฏิเสธ (Rejected) — รวมเคสอนุมัติ 0 ทุกบรรทัด
// ---------------------------------------------------------------------------
// ⚠️ กับดักส่วน 2: ใบ ISSUE ที่ CONFIRMED ต้อง load requestItems มาด้วยเสมอ — ถ้า query ลืม include
// requestItems=[] จะทำให้ fullyApproved=false → ใบที่อนุมัติครบกลายเป็น 'Partial' เงียบๆ (ไม่ error)
// controller ส่วน 2 ต้องการันตีว่าใบ ISSUE โหลด requestItems ทุกครั้ง (เช็คด้วย round-trip: อนุมัติครบ → ต้องได้ Approved)
export const deriveDocStatus = (doc, requestItems = []) => {
  // RECEIVE เริ่ม CONFIRMED เสมอ รับเข้าจบขั้นเดียว ไม่มีวงจร partial/reject → Approved
  if (doc.doc_type === 'RECEIVE') return 'Approved';

  // ISSUE:
  if (doc.status === 'PENDING') return 'Pending';
  if (doc.status === 'CANCELLED') {
    return doc.resolved_by != null && doc.resolved_by === doc.requested_by ? 'Cancelled' : 'Rejected';
  }
  // CONFIRMED: อนุมัติครบทุกบรรทัด = Approved, ให้ไม่ครบ (บางบรรทัดน้อยกว่าที่ขอ) = Partial
  // (อนุมัติ 0 ทุกบรรทัดจะถูกบันทึกเป็น CANCELLED ไม่ใช่ CONFIRMED — จึงไม่มีเคส CONFIRMED ที่ว่างเปล่า)
  const fullyApproved =
    requestItems.length > 0 && requestItems.every((ri) => (ri.qty_confirmed ?? 0) >= ri.qty_requested);
  return fullyApproved ? 'Approved' : 'Partial';
};

// สถานะรายบรรทัด: อิงสถานะใบ + qty_confirmed เทียบ qty_requested
export const deriveItemStatus = (qtyRequested, qtyConfirmed, docStatus) => {
  if (docStatus === 'PENDING') return 'Pending';
  if (docStatus === 'CANCELLED') return 'Rejected'; // ทั้งใบยกเลิก/ปฏิเสธ ลูกทุกบรรทัดถือ Rejected (approvedQty=0)
  const confirmed = qtyConfirmed ?? 0;
  if (confirmed <= 0) return 'Rejected'; // บรรทัดที่ถูกตัดเหลือศูนย์ในใบที่อนุมัติบางส่วน
  if (confirmed >= qtyRequested) return 'Approved';
  return 'Partial';
};

// ---------------------------------------------------------------------------
// แปลงรายการในใบ → ทรง item เดิม (productId/sku/productName/imageUrl/requestedQty/approvedQty/status)
// ---------------------------------------------------------------------------

// ใบ ISSUE: รายการมาจาก StockRequestItem (qty_requested/qty_confirmed แยกช่อง เก็บหลักฐานว่าขอ vs ให้จริง)
export const mapRequestItem = (ri, docStatus) => ({
  productId: ri.item_id, // ฐานใหม่ item_id เป็นทั้ง productId และ sku (ตัวเดียวกัน)
  sku: ri.item_id,
  productName: ri.item?.name ?? '',
  imageUrl: ri.item?.image_url || '',
  groupId: ri.item?.group_id ?? '', // Homepage ใช้ตอน export PDF (คอลัมน์หมวดหมู่)
  groupName: ri.item?.group?.group_name ?? '',
  requestedQty: ri.qty_requested,
  approvedQty: ri.qty_confirmed ?? 0, // ยัง PENDING = ยังไม่ให้ = 0 (หน้าเว็บ default ช่องอนุมัติจาก requestedQty เอง)
  status: deriveItemStatus(ri.qty_requested, ri.qty_confirmed, docStatus)
});

// ใบ RECEIVE: ไม่มีวงจรขอ/อนุมัติ รายการมาจาก StockTransaction (type IN) ที่สร้างพร้อมใบ
// requested = approved = qty_change (รับเข้าเท่าไหร่ได้เท่านั้น)
export const mapReceiveItem = (tx) => ({
  productId: tx.item_id,
  sku: tx.item_id,
  productName: tx.item?.name ?? '',
  imageUrl: tx.item?.image_url || '',
  groupId: tx.item?.group_id ?? '',
  groupName: tx.item?.group?.group_name ?? '',
  requestedQty: tx.qty_change,
  approvedQty: tx.qty_change,
  status: 'Approved'
});

// ---------------------------------------------------------------------------
// ล่ามหลัก: 1 StockDocument (+ relation ที่ load มาแล้ว) → 1 transaction ทรงเดิม
// ต้อง load มาก่อน: requestItems(.item), transactions(.item), creator/requester/resolver
// (การ load เป็นงานของ controller ใน "ส่วน 2" — ฟังก์ชันนี้อ่าน field ล้วนๆ จึงเทสต์ได้)
// ---------------------------------------------------------------------------
export const mapDocumentToTransaction = (doc) => {
  const isReceive = doc.doc_type === 'RECEIVE';
  const type = docTypeToTxType(doc.doc_type);
  const status = deriveDocStatus(doc, doc.requestItems ?? []);

  const items = isReceive
    ? (doc.transactions ?? []).map(mapReceiveItem)
    : (doc.requestItems ?? []).map((ri) => mapRequestItem(ri, doc.status));

  // ผู้ทำรายการ: RECEIVE ผู้สร้าง = ทั้งผู้ทำและผู้ปิด (จบขั้นเดียว) · ISSUE ผู้ขอ vs ผู้ปิด แยกกัน
  const requesterUsername = isReceive ? (doc.creator?.username ?? null) : (doc.requester?.username ?? null);
  const adminUsername = isReceive ? (doc.creator?.username ?? null) : (doc.resolver?.username ?? null);

  return {
    id: doc.id,
    transactionId: doc.doc_no, // เลขที่ใบที่มนุษย์อ่านได้ (ISS-6907-0001) แทน REQ-{timestamp} เดิม
    type,
    status,
    requesterUsername,
    adminUsername,
    project: doc.project ?? null,
    requestDate: doc.created_at, // เวลาสร้างใบ (Prisma DateTime → ISO ตอน serialize) ใช้เรียง/ตัดวัน
    resolvedDate: doc.resolved_at ?? null,
    pickedUpAt: doc.picked_up_at ?? null, // NULL = ใบอนุมัติแล้วที่ยังค้างคิวรอส่งมอบ (ข้อ 6.14) — ชื่อ field ตามทรง JSON ของ reference
    adminMessage: doc.note ?? null, // note ระดับใบ = เหตุผลปฏิเสธ/ยกเลิก (ตรงกับ adminMessage เดิม)
    items
  };
};

// ---------------------------------------------------------------------------
// คิวรอส่งมอบ (DATABASE.md ข้อ 6.14): "อนุมัติแล้ว" ≠ "ของออกจากคลังแล้ว"
// บันทึกส่งมอบได้เฉพาะใบ ISSUE ที่ CONFIRMED และยังไม่เคยบันทึก — กดซ้ำ = error ไม่ใช่เขียนทับ
// (เวลาส่งมอบคือหลักฐาน เขียนทับได้เมื่อไหร่ก็ปลอมได้เมื่อนั้น) · สิทธิ์กดคุมที่ route (Admin/Manager)
// หมายเหตุ: RECEIVE ก็ status=CONFIRMED เหมือนกัน — เช็ค doc_type ด้วยเสมอ ไม่งั้นใบรับเข้าหลุดเข้าคิว
// ---------------------------------------------------------------------------
export const canMarkPickedUp = (doc) => {
  if (doc.doc_type !== 'ISSUE' || doc.status !== 'CONFIRMED') {
    return { ok: false, error: 'รายการนี้ไม่อยู่ในสถานะรอส่งมอบสินค้า' };
  }
  if (doc.picked_up_at != null) {
    return { ok: false, error: 'รายการนี้บันทึกการส่งมอบไปแล้ว' };
  }
  return { ok: true };
};

// ---------------------------------------------------------------------------
// ตัวกรอง GET /transactions: ?view=active|dashboard · ?since= · ?until= (สเปคพอร์ตจาก
// wms-ics-reference getFullTransactions — DATABASE.md ข้อ 6.17) แปลงเป็น Prisma where object
// บนฐาน 3-สถานะของเรา (reference เก็บสถานะ 5 ค่าตรงๆ เราต้อง derive คืนเป็นเงื่อนไขฐานเอง)
// pure ล้วน — controller เอาไปใส่ findMany({ where }) ตรงๆ
// ---------------------------------------------------------------------------

// ISO string → Date | null (ว่าง/พาร์สไม่ผ่าน = null = "ไม่ได้กรองด้วยค่านี้" — ห้ามปล่อย
// Invalid Date เข้า Prisma where เพราะจะ throw ตอน query จริง)
export const parseIsoDate = (raw) => {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
};

// ใบค้าง = PENDING ทุก doc_type (รออนุมัติ) OR ใบเบิกที่ยืนยันแล้วแต่ยังไม่ส่งมอบ
// (reference: status IN Approved/Partial — ฝั่งเราทั้งสองค่าคือ CONFIRMED เดียวกัน)
const buildActiveWhere = () => ({
  OR: [{ status: 'PENDING' }, { doc_type: 'ISSUE', status: 'CONFIRMED', picked_up_at: null }]
});

// since/until เทียบ COALESCE(resolved_at, created_at) ตาม reference — Prisma ไม่มี COALESCE ใน
// where จึงกางเป็น OR สองก้อน: ใบที่ปิดแล้วดู resolved_at, ใบที่ยังไม่ปิด (resolved_at NULL) ดู created_at
const buildTimeWhere = (sinceDate, untilDate) => {
  const range = {};
  if (sinceDate) range.gte = sinceDate;
  if (untilDate) range.lt = untilDate;
  return { OR: [{ resolved_at: range }, { resolved_at: null, created_at: range }] };
};

export const buildTransactionWhere = ({ view, since, until } = {}) => {
  const isActive = view === 'active' || view === 'dashboard';
  const sinceDate = parseIsoDate(since);
  const untilDate = parseIsoDate(until);
  const hasTime = sinceDate != null || untilDate != null;

  const activeWhere = isActive ? buildActiveWhere() : null;
  const timeWhere = hasTime ? buildTimeWhere(sinceDate, untilDate) : null;

  if (activeWhere && timeWhere) return { OR: [activeWhere, timeWhere] };
  if (activeWhere) return activeWhere;
  if (timeWhere) return timeWhere;
  return {}; // ไม่มี query เลย = ไม่กรอง (พฤติกรรมเดิมก่อนเพิ่ม query support)
};

// ---------------------------------------------------------------------------
// ฝั่งรับค่าเข้า: ประมวลผลการอนุมัติ/ปฏิเสธใบ ISSUE (การตัดสินใจที่ database บังคับเองไม่ได้)
// pure ล้วน — controller หา currentStock จริงจาก DB มาป้อนให้ (I/O อยู่ที่ controller)
// รับ:  action 'APPROVE'|'REJECT', message, lines: [{ itemId, sku, qtyRequested, qtyApproved, currentStock }]
// คืน:  { ok:false, error } (ข้อความตรงกับระบบเก่า) | { ok:true, docStatus, message, lines:[{itemId, qtyConfirmed}] }
// ---------------------------------------------------------------------------
export const resolveOutcome = ({ action, message = '', lines = [] } = {}) => {
  const trimmed = String(message || '').trim();

  if (!['APPROVE', 'REJECT'].includes(action)) {
    return { ok: false, error: 'action ไม่ถูกต้อง' };
  }
  if (!Array.isArray(lines) || lines.length === 0) {
    return { ok: false, error: 'ไม่พบสินค้าในใบเบิก' };
  }

  // ปฏิเสธทั้งใบ: ต้องมีเหตุผลเสมอ · ทุกบรรทัดได้ 0 · ใบเป็น CANCELLED (คนคลังปิด → แสดงเป็น "ปฏิเสธ")
  if (action === 'REJECT') {
    if (!trimmed) return { ok: false, error: 'กรุณาระบุเหตุผลการปฏิเสธใบเบิก' };
    return {
      ok: true,
      docStatus: 'CANCELLED',
      message: trimmed,
      lines: lines.map((l) => ({ itemId: l.itemId, qtyConfirmed: 0 }))
    };
  }

  // อนุมัติ: ตรวจทีละบรรทัด (คืน error ตัวแรกที่เจอ — ลำดับเดียวกับระบบเก่า)
  const resolvedLines = [];
  let anyApproved = false;
  let allFull = true;
  for (const line of lines) {
    const qty = Number(line.qtyApproved);
    // ไม่ clamp เงียบ — reject พร้อมข้อความ (เผื่อคนคลังมือลั่น จะได้เห็น ไม่ใช่ถูกบีบค่าเงียบๆ)
    if (!Number.isInteger(qty) || qty < 0) {
      return { ok: false, error: `จำนวนอนุมัติของ ${line.sku} ไม่ถูกต้อง` };
    }
    if (qty > line.qtyRequested) {
      return { ok: false, error: `อนุมัติ ${line.sku} เกินจำนวนที่ขอ` };
    }
    if (qty > line.currentStock) {
      return { ok: false, error: `สินค้า ${line.sku} มีคงเหลือไม่พอ` };
    }
    if (qty > 0) anyApproved = true;
    if (qty < line.qtyRequested) allFull = false;
    resolvedLines.push({ itemId: line.itemId, qtyConfirmed: qty });
  }

  // อนุมัติไม่ครบ (บางส่วน/ตัดบางบรรทัดเหลือศูนย์) ต้องบอกเหตุผลให้ผู้ขอรับทราบเสมอ
  if (!allFull && !trimmed) {
    return { ok: false, error: 'กรุณาระบุเหตุผลเมื่ออนุมัติไม่ครบตามจำนวนที่ขอ' };
  }

  // ไม่มีบรรทัดไหนได้ของเลย → CANCELLED ไม่ใช่ CONFIRMED
  // (DATABASE.md ข้อ 6.3: ห้ามมีใบ CONFIRMED ที่ไม่มี transaction — ไม่มีใครได้ของ = ไม่มี transaction ถูกสร้าง)
  const docStatus = anyApproved ? 'CONFIRMED' : 'CANCELLED';
  return { ok: true, docStatus, message: trimmed || null, lines: resolvedLines };
};
