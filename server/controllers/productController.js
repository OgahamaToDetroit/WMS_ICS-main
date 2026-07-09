// เส้น products ย้ายมาใช้ database ใหม่ (ผ่าน server/prisma.js) แล้ว — บทบาท "ล่าม":
// ใช้ตาราง/ตรรกะของฐานใหม่ข้างใน แต่ตอบ JSON ทรงเดิมให้หน้า React
//
// audit ย้ายมาฐานใหม่แล้วพร้อมเส้น auth (utils/audit.js ใช้ actor_id FK → users.id) —
// จุดเชื่อม 2 เส้น: logAudit ส่ง req.user.id (ไม่ใช่ username) + createProduct ประทับ created_by = req.user.id
// ที่ยังอยู่ฝั่งฐานเก่า (identifier.sqlite) ชั่วคราวตาม DATABASE.md ข้อ 12:
// - getDashboardStats (ย้ายพร้อมเส้น transactions) → ตัวเลข dashboard กับหน้า products ยังไม่ตรงกันชั่วคราว = ตั้งใจ
import db from '../db.js';
import { prisma } from '../prisma.js';
import { tryLogAudit } from '../utils/audit.js';
import {
  GROUP_CAPACITY,
  buildDocNoPrefix,
  buildNextDocNo,
  buildNextItemId,
  buildStockMap,
  mapItemToProduct,
  parseCost,
  parseMinStock,
  stockOf,
  toPositiveNumber
} from '../utils/productRules.js';

const trimmedId = (value) => String(value || '').trim();

export const getProducts = async (req, res) => {
  try {
    const search = String(req.query.search || '').trim();
    const page = Math.max(Number.parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit || '50', 10), 1), 500);
    const includeInactive = req.query.includeInactive === 'true';

    // contains ของ Prisma บน SQLite = LIKE ซึ่งไม่สนตัวพิมพ์ (ASCII) อยู่แล้ว
    // — พฤติกรรมเดียวกับที่โค้ดเดิมทำด้วย LOWER() สองฝั่ง
    const where = {
      ...(includeInactive ? {} : { is_active: true }),
      ...(search
        ? {
            OR: [
              { item_id: { contains: search } },
              { name: { contains: search } },
              { vendor: { contains: search } }
            ]
          }
        : {})
    };

    const totalItems = await prisma.item.count({ where });
    const items = await prisma.item.findMany({
      where,
      include: { group: true },
      orderBy: { name: 'asc' },
      skip: (page - 1) * limit,
      take: limit
    });

    // ยอดคงเหลือไม่มีคอลัมน์เก็บ — SUM(qty_change) สดทุกครั้ง เฉพาะสินค้าหน้านี้
    // สินค้าที่ไม่มีแถว transaction เลยจะไม่โผล่ในผล groupBy → stockOf ถือว่า "ไม่มีแถว = 0"
    const sums = items.length === 0
      ? []
      : await prisma.stockTransaction.groupBy({
          by: ['item_id'],
          where: { item_id: { in: items.map((item) => item.item_id) } },
          _sum: { qty_change: true }
        });
    const stockMap = buildStockMap(sums);

    return res.status(200).json({
      success: true,
      products: items.map((item) => mapItemToProduct(item, stockOf(stockMap, item.item_id))),
      page,
      totalPages: Math.max(Math.ceil(totalItems / limit), 1),
      totalItems
    });
  } catch (error) {
    console.error('getProducts Error:', error);
    return res.status(500).json({ success: false, message: 'Database error' });
  }
};

// รายชื่อกลุ่มสินค้า — ให้ฟอร์ม "เพิ่มสินค้า" ใช้เลือกกลุ่มก่อนให้ระบบออกรหัส
export const getProductGroups = async (req, res) => {
  try {
    const groups = await prisma.itemGroup.findMany({ orderBy: { group_id: 'asc' } });
    return res.json({
      success: true,
      groups: groups.map((group) => ({ id: group.group_id, name: group.group_name }))
    });
  } catch (error) {
    console.error('getProductGroups Error:', error);
    return res.status(500).json({ success: false, message: 'Database error' });
  }
};

const CODE_RETRY_LIMIT = 3;
const GROUP_NEAR_FULL_THRESHOLD = 50; // เหลือรหัสน้อยกว่านี้เริ่มเตือน (นโยบาย "เต็มแล้วทำยังไง" พักไว้ตามข้อ 9)

export const createProduct = async (req, res) => {
  try {
    // ไม่รับ sku จากผู้ใช้อีกต่อไป — ระบบออกรหัสให้ตามกลุ่มเท่านั้น (การตัดสินใจข้อ 4/9)
    const name = String(req.body.name || '').trim();
    const groupId = trimmedId(req.body.groupId);
    const unit = String(req.body.unit || '').trim();
    const vendor = String(req.body.vendor || '').trim();
    const imageUrl = String(req.body.imageUrl || '').trim();
    const minStock = parseMinStock(req.body.minStock);
    const latestCost = parseCost(req.body.latestCost);
    const initialStock = toPositiveNumber(req.body.initialStock);

    if (!name) {
      return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อสินค้า' });
    }
    if (!/^\d{2}$/.test(groupId)) {
      return res.status(400).json({ success: false, message: 'กรุณาเลือกกลุ่มสินค้า' });
    }
    if (!minStock.ok) {
      return res.status(400).json({ success: false, message: 'จุดเตือนขั้นต่ำต้องเป็นตัวเลข 0 ขึ้นไป (เว้นว่าง = ยังไม่ตั้งเกณฑ์)' });
    }
    if (!latestCost.ok) {
      return res.status(400).json({ success: false, message: 'ราคาต้องเป็นตัวเลข 0 ขึ้นไป (เว้นว่าง = ไม่รู้ราคา)' });
    }

    const group = await prisma.itemGroup.findUnique({ where: { group_id: groupId } });
    if (!group) {
      return res.status(400).json({ success: false, message: 'ไม่พบกลุ่มสินค้านี้ในทะเบียน' });
    }

    const now = new Date();
    const actorId = req.user?.id ?? null; // คน login (route ห่อ verifyAuth อยู่แล้ว) — ประทับเป็น created_by

    // อ่าน MAX + insert ต้องอยู่ใน transaction เดียว และถือ unique constraint (PK/doc_no)
    // เป็นรั้วชั้นสุดท้าย — ชนเมื่อไหร่ (P2002) วนออกเลขใหม่ ไม่ใช่ล้มทั้งคำขอ
    let created = null;
    for (let attempt = 1; attempt <= CODE_RETRY_LIMIT && !created; attempt += 1) {
      try {
        created = await prisma.$transaction(async (tx) => {
          // MAX ในกลุ่ม: รหัสเป็น text ความยาวเท่ากันแบบ 0-padded → เรียง text = เรียงตัวเลข
          const latest = await tx.item.findFirst({
            where: { group_id: groupId },
            orderBy: { item_id: 'desc' },
            select: { item_id: true }
          });
          const itemId = buildNextItemId(groupId, latest?.item_id ?? null);
          if (!itemId) {
            const groupFull = new Error(`กลุ่ม ${groupId} ใช้รหัสครบ ${GROUP_CAPACITY} ตัวแล้ว สร้างสินค้าเพิ่มไม่ได้`);
            groupFull.code = 'GROUP_FULL';
            throw groupFull;
          }

          await tx.item.create({
            data: {
              item_id: itemId,
              name,
              group_id: groupId,
              unit: unit || null,
              vendor: vendor || null,
              latest_cost: latestCost.value,
              min_stock: minStock.value, // NULL = ยังไม่ตั้งเกณฑ์ — ห้ามแทนด้วย default
              image_url: imageUrl || null
            }
          });

          // ยอดเริ่มต้น = ออกใบ RECEIVE (CONFIRMED) ให้อัตโนมัติ 1 ใบ (การตัดสินใจข้อ 10)
          // เพราะแอปห้ามสร้าง OPENING (ของ migration เท่านั้น) และ IN ทุกแถวต้องมีใบกำกับ
          let docNo = null;
          if (initialStock != null) {
            const prefix = buildDocNoPrefix('RECEIVE', now);
            const latestDoc = await tx.stockDocument.findFirst({
              where: { doc_no: { startsWith: prefix } },
              orderBy: { doc_no: 'desc' },
              select: { doc_no: true }
            });
            docNo = buildNextDocNo(prefix, latestDoc?.doc_no ?? null);

            const doc = await tx.stockDocument.create({
              data: {
                doc_no: docNo,
                doc_type: 'RECEIVE',
                doc_date: now,
                status: 'CONFIRMED', // RECEIVE เริ่ม CONFIRMED เสมอ — รับเข้าจบในขั้นเดียว ไม่มีวงจรอนุมัติ
                note: 'ยอดเริ่มต้นจากการสร้างสินค้าใหม่',
                // requested_by/resolved_by/resolved_at = NULL ตามตาราง state ของใบ RECEIVE (data_dictionary §6.1)
                created_by: actorId // ประทับจากคน login (เส้น auth ย้ายมาฐานนี้แล้ว)
              }
            });

            await tx.stockTransaction.create({
              data: {
                item_id: itemId,
                type: 'IN', // ประทับตามชนิดใบ (RECEIVE→IN) ห้ามให้ผู้ใช้เลือก
                qty_change: initialStock,
                unit_cost: latestCost.value,
                transaction_date: now, // ใบตรง: copy doc_date ลง transaction_date (data_dictionary ข้อ 6)
                document_id: doc.id,
                created_by: actorId
              }
            });
          }

          return { itemId, docNo, remaining: GROUP_CAPACITY - Number(itemId.slice(-3)) };
        });
      } catch (error) {
        if (error?.code === 'P2002' && attempt < CODE_RETRY_LIMIT) continue;
        if (error?.code === 'GROUP_FULL') {
          return res.status(409).json({ success: false, message: error.message });
        }
        throw error;
      }
    }
    if (!created) {
      return res.status(409).json({ success: false, message: 'ออกรหัสสินค้าไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' });
    }

    await tryLogAudit(req.user?.id, 'product.create', 'product', created.itemId, {
      name,
      groupId,
      minStock: minStock.value,
      initialStock: initialStock ?? 0,
      receiveDocNo: created.docNo
    });

    return res.status(201).json({
      success: true,
      message: 'สร้างสินค้าเรียบร้อย',
      sku: created.itemId,
      ...(created.remaining <= GROUP_NEAR_FULL_THRESHOLD
        ? { warning: `กลุ่ม ${groupId} เหลือรหัสว่างอีก ${created.remaining} รหัส (เพดาน ${GROUP_CAPACITY})` }
        : {})
    });
  } catch (error) {
    console.error('createProduct Error:', error);
    return res.status(500).json({ success: false, message: 'Database error' });
  }
};

export const updateProduct = async (req, res) => {
  try {
    const itemId = trimmedId(req.params.id);
    const existing = await prisma.item.findUnique({ where: { item_id: itemId } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'ไม่พบสินค้า' });
    }

    // แก้เฉพาะ field ที่ส่งมาจริง (มี key ใน body) — field ที่ไม่ส่ง = ไม่แตะของเดิม
    // กันบั๊กแบบระบบเก่าที่เสก default ไปทับค่าที่ไม่ได้ตั้งใจแก้
    const data = {};

    if ('name' in req.body) {
      const name = String(req.body.name || '').trim();
      if (!name) {
        return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อสินค้า' });
      }
      data.name = name;
    }
    if ('unit' in req.body) data.unit = String(req.body.unit || '').trim() || null;
    if ('vendor' in req.body) data.vendor = String(req.body.vendor || '').trim() || null;
    if ('imageUrl' in req.body) data.image_url = String(req.body.imageUrl || '').trim() || null;
    if ('minStock' in req.body) {
      const minStock = parseMinStock(req.body.minStock);
      if (!minStock.ok) {
        return res.status(400).json({ success: false, message: 'จุดเตือนขั้นต่ำต้องเป็นตัวเลข 0 ขึ้นไป (เว้นว่าง = ยังไม่ตั้งเกณฑ์)' });
      }
      data.min_stock = minStock.value; // ค่าว่าง = ถอนเกณฑ์กลับเป็น NULL ("ยังไม่ตั้ง") — ทำได้โดยตั้งใจ
    }
    // ราคา: ค่าว่าง = ไม่แตะราคาเดิม (พฤติกรรมเดิมของฟอร์ม — ช่องนี้ไม่ใช่ที่สำหรับ "ล้างราคา")
    if ('latestCost' in req.body && req.body.latestCost !== '' && req.body.latestCost != null) {
      const latestCost = parseCost(req.body.latestCost);
      if (!latestCost.ok) {
        return res.status(400).json({ success: false, message: 'ราคาต้องเป็นตัวเลข 0 ขึ้นไป' });
      }
      data.latest_cost = latestCost.value;
    }
    // จงใจไม่รับ groupId/groupName — กลุ่มผูกกับ 2 ตัวแรกของรหัสสินค้า เปลี่ยนกลุ่ม = ต้องออกรหัสใหม่
    // (รหัสเดิม reuse ไม่ได้ตลอดกาล — ข้อ 9) จึงไม่มีแนวคิด "ย้ายกลุ่ม" ในการแก้ไขสินค้า

    await prisma.item.update({ where: { item_id: itemId }, data });
    await tryLogAudit(req.user?.id, 'product.update', 'product', itemId, { fields: Object.keys(data) });

    return res.json({ success: true, message: 'อัปเดตสินค้าเรียบร้อย' });
  } catch (error) {
    console.error('updateProduct Error:', error);
    return res.status(500).json({ success: false, message: 'Database error' });
  }
};

export const deleteProduct = async (req, res) => {
  try {
    const itemId = trimmedId(req.params.id);
    const existing = await prisma.item.findUnique({
      where: { item_id: itemId },
      select: { item_id: true }
    });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'ไม่พบสินค้า' });
    }

    // soft delete เท่านั้น — FK ทั้งฐานตั้ง ON DELETE RESTRICT ลบจริงจะโดน database ปฏิเสธ
    // และประวัติ transaction ของสินค้าต้องอยู่ครบตลอดกาล
    await prisma.item.update({ where: { item_id: itemId }, data: { is_active: false } });
    await tryLogAudit(req.user?.id, 'product.archive', 'product', itemId);

    return res.json({ success: true, message: 'ปิดใช้งานสินค้าเรียบร้อย' });
  } catch (error) {
    console.error('deleteProduct Error:', error);
    return res.status(500).json({ success: false, message: 'Database error' });
  }
};

// bulkImportProducts ถูกถอดออกตามการตัดสินใจข้อ 11 — ช่องนำเข้าที่รับรหัสจากไฟล์ตรงๆ
// คือประตูหลังเลี่ยงระบบออกรหัสตามกลุ่ม (โค้ดเดิมดูได้จาก git history ถ้ามีเหตุต้องฟื้น)

// ---------------------------------------------------------------------------
// ด้านล่างนี้ยังอ่านฐานเก่า (identifier.sqlite) — ย้ายพร้อมเส้น transactions ตามข้อ 12
// ---------------------------------------------------------------------------

export const getDashboardStats = (req, res) => {
  try {
    const today = new Date();
    const offset = today.getTimezoneOffset() * 60000;
    const localDate = new Date(today.getTime() - offset).toISOString().slice(0, 10);

    // รวมจำนวนชิ้นคงเหลือทั้งหมด นับเฉพาะสินค้าที่ยังใช้งานอยู่ (ตัวที่ปิดใช้งานไม่ถูกนับ)
    const totalItemsRow = db.prepare(`
      SELECT SUM(COALESCE(wb.stock_balance, 0)) as total
      FROM items i
      LEFT JOIN warehouse_balance wb ON wb.item_id = i.item_id
      LEFT JOIN product_settings ps ON ps.item_id = i.item_id
      WHERE COALESCE(ps.is_active, 1) = 1
    `).get();

    const lowStockCountRow = db.prepare(`
      SELECT COUNT(*) as count
      FROM items i
      LEFT JOIN warehouse_balance wb ON i.item_id = wb.item_id
      LEFT JOIN product_settings ps ON ps.item_id = i.item_id
      WHERE COALESCE(ps.is_active, 1) = 1
        AND COALESCE(wb.stock_balance, 0) <= COALESCE(ps.min_stock, 10)
    `).get();

    // input/output_date เก็บเป็น UTC (toISOString) ต้องแปลงเป็นเวลาท้องถิ่นก่อนตัดเทียบวัน
    // ไม่งั้นรายการช่วงเย็น (หลัง 17:00 เวลาไทย) จะถูกนับเป็นของวันถัดไปตามปฏิทิน UTC
    const inboundTodayRow = db.prepare(`SELECT SUM(quantity) as total FROM stock_in WHERE date(input_date, 'localtime') = ?`).get(localDate);
    const outboundTodayRow = db.prepare(`SELECT SUM(quantity) as total FROM stock_out WHERE date(output_date, 'localtime') = ?`).get(localDate);

    const activities = db.prepare(`
      SELECT transactionId, type, requesterUsername, project, status, requestDate, resolvedDate, adminUsername
      FROM wms_transactions
      ORDER BY COALESCE(resolvedDate, requestDate) DESC
      LIMIT 10
    `).all();

    const stockLevels = db.prepare(`
      SELECT
        i.item_id AS sku,
        i.item_name AS name,
        COALESCE(wb.stock_balance, 0) AS stock,
        COALESCE(ps.min_stock, 10) AS minStock
      FROM items i
      LEFT JOIN warehouse_balance wb ON i.item_id = wb.item_id
      LEFT JOIN product_settings ps ON ps.item_id = i.item_id
      WHERE COALESCE(ps.is_active, 1) = 1
      ORDER BY COALESCE(wb.stock_balance, 0) ASC
      LIMIT 10
    `).all();

    const stats = {
      totalItems: totalItemsRow?.total || 0,
      lowStockCount: lowStockCountRow?.count || 0,
      inboundToday: inboundTodayRow?.total || 0,
      outboundToday: outboundTodayRow?.total || 0
    };

    return res.status(200).json({ success: true, stats, activities, stockLevels });
  } catch (error) {
    console.error('getDashboardStats Error:', error);
    res.status(500).json({ success: false, message: 'Database error' });
  }
};
