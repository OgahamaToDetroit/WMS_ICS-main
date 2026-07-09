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

// ---------------------------------------------------------------------------
// enum ชนิดใบ: หัวใบใหม่ → ประเภทที่หน้าเว็บรู้จัก
// ---------------------------------------------------------------------------
export const docTypeToTxType = (docType) => (docType === 'RECEIVE' ? 'INBOUND' : 'OUTBOUND');

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
    adminMessage: doc.note ?? null, // note ระดับใบ = เหตุผลปฏิเสธ/ยกเลิก (ตรงกับ adminMessage เดิม)
    items
  };
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
