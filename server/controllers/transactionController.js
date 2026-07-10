// เส้น transactions ย้ายมาใช้ database ใหม่ (ผ่าน server/prisma.js) แล้ว — บทบาท "ล่าม":
// ข้างในใช้ StockDocument + StockRequestItem + StockTransaction ของฐานใหม่ แต่ตอบ JSON ทรงเดิม
// (INBOUND/OUTBOUND + สถานะ 5 ค่า) ให้หน้า Homepage/Navbar ผ่าน utils/transactionRules.js
//
// โครงสร้างต่างจากฐานเก่า:
//   ฐานเก่า: wms_transactions (flat) + stock_in/out + warehouse_balance view
//   ฐานใหม่: ยอดคงเหลือ = SUM(qty_change) สด · ISSUE พักที่ stock_request_items ตอน PENDING
//            (ยังไม่แตะยอด) → สร้าง stock_transactions (type OUT) ตอนคนคลังยืนยันเท่านั้น
import { prisma } from '../prisma.js';
import { tryLogAudit } from '../utils/audit.js';
import { broadcast } from '../events.js';
import { DOCUMENT_INCLUDE, mapDocumentToTransaction, resolveOutcome } from '../utils/transactionRules.js';
import { buildDocNoPrefix, buildNextDocNo, parseMinStock } from '../utils/productRules.js';

const CODE_RETRY_LIMIT = 3; // ชน doc_no ซ้ำ (P2002) แล้ววนออกเลขใหม่ ไม่ล้มทั้งคำขอ

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.statusCode = 400;
  }
}

const trimmedId = (value) => String(value || '').trim();

const toPositiveInteger = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

// ยอดคงเหลือ = SUM(qty_change) สดเสมอ (ไม่มีคอลัมน์เก็บ) · ไม่มีแถว = 0 ไม่ใช่ NULL
// รับ client (prisma หรือ tx) เพื่อให้อ่านยอดล่าสุดภายใน transaction เดียวกับตอนเขียนได้
const getCurrentStock = async (client, itemId) => {
  const agg = await client.stockTransaction.aggregate({
    _sum: { qty_change: true },
    where: { item_id: itemId }
  });
  return agg._sum.qty_change ?? 0;
};

// เลขที่ใบถัดไป (MAX+1 ในรอบเดือนของ prefix) — หลักการเดียวกับ productController
const generateDocNo = async (client, docType, date) => {
  const prefix = buildDocNoPrefix(docType, date);
  const latest = await client.stockDocument.findFirst({
    where: { doc_no: { startsWith: prefix } },
    orderBy: { doc_no: 'desc' },
    select: { doc_no: true }
  });
  return buildNextDocNo(prefix, latest?.doc_no ?? null);
};

const handleError = (res, err) => {
  const statusCode = err.statusCode || 500;
  // 500 = บั๊กจริง log เต็มไว้สืบ · 400 = ผู้ใช้กรอกผิดตามปกติ log สั้นพอ (ไม่งั้น log เต็มไปด้วย stack)
  if (statusCode === 500) console.error(err);
  else console.warn(`[transaction] ${err.message}`);
  res.status(statusCode).json({ success: false, message: statusCode === 500 ? 'Database error' : err.message });
};

// เห็นทุกใบถ้าเป็น Admin/Manager · ผู้ขอ (Operator) เห็นเฉพาะใบของตัวเอง (แบบเดียวกับระบบเดิม)
const visibleTo = (transactions, user) => {
  if (['Admin', 'Manager'].includes(user.role)) return transactions;
  return transactions.filter((t) => t.requesterUsername === user.username);
};

export const getTransactions = async (req, res) => {
  try {
    const docs = await prisma.stockDocument.findMany({
      include: DOCUMENT_INCLUDE,
      orderBy: { created_at: 'desc' }
    });
    const transactions = visibleTo(docs.map(mapDocumentToTransaction), req.user);
    res.json({ success: true, transactions });
  } catch (err) {
    handleError(res, err);
  }
};

export const getHistory = async (req, res) => {
  try {
    const docs = await prisma.stockDocument.findMany({
      include: DOCUMENT_INCLUDE,
      orderBy: { created_at: 'desc' }
    });
    const transactions = visibleTo(docs.map(mapDocumentToTransaction), req.user);
    const history = transactions.filter((t) => t.status !== 'Pending');
    res.json({ success: true, history });
  } catch (err) {
    handleError(res, err);
  }
};

// ---------------------------------------------------------------------------
// เขียน: คำขอเบิก (ISSUE) — สร้างใบ PENDING + พักรายการที่ stock_request_items (ยังไม่แตะยอด)
// ---------------------------------------------------------------------------
export const createOutboundRequest = async (req, res) => {
  try {
    const { items, project } = req.body;
    if (!Array.isArray(items) || items.length === 0) throw new ValidationError('ไม่มีรายการสินค้า');
    const trimmedProject = String(project || '').trim();
    if (!trimmedProject) throw new ValidationError('กรุณาระบุโปรเจกต์');

    const now = new Date();
    const actorId = req.user?.id ?? null;

    let created = null;
    for (let attempt = 1; attempt <= CODE_RETRY_LIMIT && !created; attempt += 1) {
      try {
        created = await prisma.$transaction(async (tx) => {
          // ตรวจทุกบรรทัด: มีจริง + ยังใช้งาน + สต็อกพอ (เช็คตอนขอตามระบบเดิม)
          const lines = [];
          for (const item of items) {
            const itemId = trimmedId(item.productId || item.sku);
            const reqQty = toPositiveInteger(item.quantity);
            if (!itemId || !reqQty) throw new ValidationError('จำนวนเบิกไม่ถูกต้อง');

            const product = await tx.item.findFirst({
              where: { item_id: itemId, is_active: true },
              select: { item_id: true }
            });
            if (!product) throw new ValidationError(`ไม่พบสินค้า ${itemId}`);

            const stock = await getCurrentStock(tx, itemId);
            if (reqQty > stock) throw new ValidationError(`สินค้า ${itemId} มีคงเหลือไม่พอ`);

            lines.push({ itemId, reqQty });
          }

          const docNo = await generateDocNo(tx, 'ISSUE', now);
          const doc = await tx.stockDocument.create({
            data: {
              doc_no: docNo,
              doc_type: 'ISSUE',
              doc_date: now,
              status: 'PENDING', // ISSUE เริ่ม PENDING เสมอ ต้องผ่านคนคลังยืนยันก่อนถึงกระทบสต็อก
              project: trimmedProject,
              requested_by: actorId,
              created_by: actorId
            }
          });

          // พักที่ stock_request_items เท่านั้น — ยังไม่สร้าง stock_transactions (ยอดจะได้ไม่ลดทั้งที่ของยังอยู่)
          for (const line of lines) {
            await tx.stockRequestItem.create({
              data: { document_id: doc.id, item_id: line.itemId, qty_requested: line.reqQty }
            });
          }
          return { id: doc.id, docNo };
        });
      } catch (error) {
        if (error?.code === 'P2002' && attempt < CODE_RETRY_LIMIT) continue;
        throw error;
      }
    }
    if (!created) throw new ValidationError('ออกเลขที่ใบไม่สำเร็จ กรุณาลองใหม่');

    await tryLogAudit(actorId, 'transaction.request_outbound', 'document', created.id, {
      docNo: created.docNo,
      project: trimmedProject,
      itemCount: items.length
    });
    broadcast('transactions'); // ใบใหม่ PENDING ยังไม่แตะยอด — ไม่ต้องยิง products
    res.status(201).json({ success: true, message: 'ส่งคำขอเบิกแบบชุดสำเร็จ', transactionId: created.docNo });
  } catch (err) {
    handleError(res, err);
  }
};

// ---------------------------------------------------------------------------
// เขียน: รับเข้า (RECEIVE) — สร้างใบ CONFIRMED + stock_transactions (type IN) ทันที จบขั้นเดียว
// ---------------------------------------------------------------------------
export const createInboundTransaction = async (req, res) => {
  try {
    const itemId = trimmedId(req.body.sku);
    const inboundQty = toPositiveInteger(req.body.quantity);
    const name = String(req.body.name || '').trim();
    const note = String(req.body.note || '').trim();
    const imageUrl = req.body.imageUrl != null ? String(req.body.imageUrl).trim() : null;

    if (!itemId || !inboundQty) throw new ValidationError('ข้อมูลไม่ครบถ้วน');

    // ถอนกับดัก || 10: เว้นว่าง = ไม่ตั้งเกณฑ์ (NULL) ไม่ใช่ 10 (DATABASE.md ข้อ 6.8)
    const minStock = parseMinStock(req.body.minStock);
    if (!minStock.ok) {
      throw new ValidationError('จุดเตือนขั้นต่ำต้องเป็นตัวเลข 0 ขึ้นไป (เว้นว่าง = ยังไม่ตั้งเกณฑ์)');
    }

    const now = new Date();
    const actorId = req.user?.id ?? null;

    let created = null;
    for (let attempt = 1; attempt <= CODE_RETRY_LIMIT && !created; attempt += 1) {
      try {
        created = await prisma.$transaction(async (tx) => {
          // ตัด auto-create — สินค้าต้องมีในทะเบียนก่อน (ออกรหัสที่หน้าเพิ่มสินค้าเท่านั้น DATABASE.md ข้อ 9)
          const existing = await tx.item.findUnique({
            where: { item_id: itemId },
            select: { item_id: true, name: true }
          });
          if (!existing) {
            throw new ValidationError('ไม่พบสินค้านี้ในทะเบียน กรุณาสร้างที่หน้าจัดการสินค้าก่อน');
          }

          // อัปเดต master data ที่ฟอร์มรับเข้าแก้ได้ (คงพฤติกรรมเดิม แต่ถอนกับดัก || 10 แล้ว)
          const itemUpdate = {};
          if (name && name !== existing.name) itemUpdate.name = name;
          if ('minStock' in req.body) itemUpdate.min_stock = minStock.value; // ค่าว่าง = ถอนเกณฑ์กลับเป็น NULL
          if (imageUrl) itemUpdate.image_url = imageUrl;
          if (Object.keys(itemUpdate).length > 0) {
            await tx.item.update({ where: { item_id: itemId }, data: itemUpdate });
          }

          const docNo = await generateDocNo(tx, 'RECEIVE', now);
          const doc = await tx.stockDocument.create({
            data: {
              doc_no: docNo,
              doc_type: 'RECEIVE',
              doc_date: now,
              status: 'CONFIRMED', // RECEIVE เริ่ม CONFIRMED เสมอ รับเข้าจบในขั้นเดียว
              note: note || null,
              created_by: actorId
            }
          });
          await tx.stockTransaction.create({
            data: {
              item_id: itemId,
              type: 'IN', // ประทับตามชนิดใบ (RECEIVE→IN) ห้ามให้ผู้ใช้เลือก
              qty_change: inboundQty,
              transaction_date: now, // ใบตรง: transaction_date = doc_date (สร้างพร้อมใบ)
              document_id: doc.id,
              created_by: actorId
            }
          });
          return { id: doc.id, docNo };
        });
      } catch (error) {
        if (error?.code === 'P2002' && attempt < CODE_RETRY_LIMIT) continue;
        throw error;
      }
    }
    if (!created) throw new ValidationError('ออกเลขที่ใบไม่สำเร็จ กรุณาลองใหม่');

    await tryLogAudit(actorId, 'transaction.inbound', 'document', created.id, {
      itemId,
      quantity: inboundQty,
      docNo: created.docNo
    });
    broadcast('transactions');
    broadcast('products'); // รับเข้าจบขั้นเดียว ยอดคงเหลือเปลี่ยนแล้ว
    res.status(201).json({ success: true, message: 'บันทึกรับเข้าสำเร็จ', transactionId: created.docNo });
  } catch (err) {
    handleError(res, err);
  }
};

// ---------------------------------------------------------------------------
// ยืนยัน/ปฏิเสธใบ ISSUE — ตัดสินผลด้วย resolveOutcome (pure) แล้วเขียนตามผล
// สร้าง stock_transactions (OUT) จาก qty_confirmed เฉพาะบรรทัดที่ได้ของ · copy project หัวใบลงบรรทัด
// ---------------------------------------------------------------------------
export const resolveTransaction = async (req, res) => {
  try {
    const docId = Number(req.params.id);
    if (!Number.isInteger(docId)) return res.status(404).json({ success: false, message: 'ไม่พบรายการ' });
    const { action, updatedItems, adminMessage } = req.body;
    const message = String(adminMessage || '').trim();
    const now = new Date();
    const actorId = req.user?.id ?? null;

    const result = await prisma.$transaction(async (tx) => {
      const doc = await tx.stockDocument.findUnique({
        where: { id: docId },
        include: { requestItems: { orderBy: { id: 'asc' } } }
      });
      if (!doc) return { notFound: true };
      if (doc.doc_type !== 'ISSUE') throw new ValidationError('ใบนี้ไม่ใช่ใบเบิก');
      if (doc.status !== 'PENDING') throw new ValidationError('จัดการไปแล้ว');
      if (doc.requestItems.length === 0) throw new ValidationError('ไม่พบสินค้าในใบเบิก');

      // join รายการที่ขอ + จำนวนที่ Admin กรอก + สต็อกจริงตอนนี้ → ป้อน resolveOutcome
      const updateMap = new Map(
        (Array.isArray(updatedItems) ? updatedItems : []).map((u) => [trimmedId(u.productId || u.sku), u])
      );
      const lines = [];
      for (const ri of doc.requestItems) {
        const u = updateMap.get(ri.item_id);
        // ไม่ได้ส่งจำนวนของบรรทัดนี้มา = อนุมัติเต็มตามที่ขอ (พฤติกรรมเดิม)
        const qtyApproved = u ? u.approvedQty : ri.qty_requested;
        const currentStock = await getCurrentStock(tx, ri.item_id);
        lines.push({ itemId: ri.item_id, sku: ri.item_id, qtyRequested: ri.qty_requested, qtyApproved, currentStock });
      }

      const outcome = resolveOutcome({ action, message, lines });
      if (!outcome.ok) throw new ValidationError(outcome.error);

      const confirmedMap = new Map(outcome.lines.map((l) => [l.itemId, l.qtyConfirmed]));
      for (const ri of doc.requestItems) {
        const qc = confirmedMap.get(ri.item_id) ?? 0;
        await tx.stockRequestItem.update({ where: { id: ri.id }, data: { qty_confirmed: qc } });
        // สร้าง stock_transactions เฉพาะบรรทัดที่ได้ของจริง (>0) — ยอดถึงจะลด ณ ตอนนี้
        if (qc > 0) {
          await tx.stockTransaction.create({
            data: {
              item_id: ri.item_id,
              type: 'OUT',
              qty_change: -qc, // เบิกออก = ติดลบ
              project: doc.project, // copy เจตนา (หัวใบ) → สิ่งที่เกิดจริง (บรรทัดบัญชี) ให้ตรงกัน
              transaction_date: now, // ISSUE: ของออกตอนยืนยัน ไม่ใช่ตอนขอ (data_dictionary §6.1)
              document_id: doc.id,
              created_by: actorId
            }
          });
        }
      }

      await tx.stockDocument.update({
        where: { id: doc.id },
        data: {
          status: outcome.docStatus, // CONFIRMED หรือ CANCELLED (อนุมัติ 0 ทุกบรรทัด)
          note: outcome.message,
          resolved_by: actorId,
          resolved_at: now
        }
      });
      return { doc, docStatus: outcome.docStatus };
    });

    if (result?.notFound) return res.status(404).json({ success: false, message: 'ไม่พบรายการ' });

    await tryLogAudit(actorId, 'transaction.resolve', 'document', result.doc.id, {
      docNo: result.doc.doc_no,
      docStatus: result.docStatus
    });
    broadcast('transactions');
    broadcast('products'); // ยืนยันแล้วถึงมีแถว OUT — ยอดคงเหลือเพิ่งเปลี่ยน ณ ตอนนี้
    res.json({ success: true, message: 'พิจารณาใบเบิกเสร็จสิ้น' });
  } catch (err) {
    handleError(res, err);
  }
};

// ---------------------------------------------------------------------------
// ยกเลิกใบ ISSUE — ผู้ขอถอนใบตัวเองได้เฉพาะตอน PENDING · Admin/Manager ทำได้ทุกใบ (DATABASE.md ข้อ 6)
// PENDING ยังไม่มีแถว stock_transactions → ไม่ต้องคืนยอดอะไร
// ---------------------------------------------------------------------------
export const cancelTransaction = async (req, res) => {
  try {
    const docId = Number(req.params.id);
    if (!Number.isInteger(docId)) return res.status(404).json({ success: false, message: 'ไม่พบรายการ' });
    const actorId = req.user?.id ?? null;

    const doc = await prisma.stockDocument.findUnique({
      where: { id: docId },
      select: { id: true, doc_no: true, doc_type: true, status: true, requested_by: true }
    });
    if (!doc) return res.status(404).json({ success: false, message: 'ไม่พบรายการ' });
    if (doc.doc_type !== 'ISSUE') throw new ValidationError('ยกเลิกได้เฉพาะใบเบิก');
    if (doc.status !== 'PENDING') throw new ValidationError('ยกเลิกได้เฉพาะรายการที่รออนุมัติ');

    const isOwner = doc.requested_by != null && doc.requested_by === actorId;
    const isManagerOrAdmin = ['Admin', 'Manager'].includes(req.user.role);
    if (!isOwner && !isManagerOrAdmin) {
      return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์ยกเลิกรายการนี้' });
    }

    // resolved_by = ผู้ยกเลิก · ถ้าผู้ขอถอนเอง resolved_by == requested_by → แสดงเป็น "ยกเลิก"
    await prisma.stockDocument.update({
      where: { id: doc.id },
      data: {
        status: 'CANCELLED',
        note: String(req.body?.message || '').trim() || 'ยกเลิกคำขอ',
        resolved_by: actorId,
        resolved_at: new Date()
      }
    });
    await tryLogAudit(actorId, 'transaction.cancel', 'document', doc.id, { docNo: doc.doc_no });
    broadcast('transactions'); // PENDING ไม่มีแถวยอด — ยกเลิกจึงไม่กระทบ products
    res.json({ success: true, message: 'ยกเลิกคำขอเรียบร้อย' });
  } catch (err) {
    handleError(res, err);
  }
};
