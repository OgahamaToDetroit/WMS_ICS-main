// เส้น products ย้ายมาใช้ database ใหม่ (ผ่าน server/prisma.js) แล้ว — บทบาท "ล่าม":
// ใช้ตาราง/ตรรกะของฐานใหม่ข้างใน แต่ตอบ JSON ทรงเดิมให้หน้า React
//
// audit ย้ายมาฐานใหม่แล้วพร้อมเส้น auth (utils/audit.js ใช้ actor_id FK → users.id) —
// จุดเชื่อม 2 เส้น: logAudit ส่ง req.user.id (ไม่ใช่ username) + createProduct ประทับ created_by = req.user.id
//
// getDashboardStats ย้ายมาฐานใหม่แล้ว (ส่วน 3) — reuse buildStockMap/countLowStock/localDayRange
// จาก productRules.js และ DOCUMENT_INCLUDE/mapDocumentToTransaction จาก transactionRules.js
// (activities = 10 ใบล่าสุด ทรงเดียวกับที่ /api/transactions ใช้) ไฟล์นี้จึงไม่แตะ server/db.js อีกต่อไป
import { prisma } from '../prisma.js';
import { tryLogAudit } from '../utils/audit.js';
import { broadcast } from '../events.js';
import {
  GROUP_CAPACITY,
  buildDocNoPrefix,
  buildNextDocNo,
  buildNextItemId,
  buildStockMap,
  countLowStock,
  listLowStockIds,
  localDayRange,
  mapItemToProduct,
  parseCost,
  parseMinStock,
  stockOf,
  toPositiveNumber
} from '../utils/productRules.js';
import { DOCUMENT_INCLUDE, mapDocumentToTransaction } from '../utils/transactionRules.js';

const trimmedId = (value) => String(value || '').trim();

export const getProducts = async (req, res) => {
  try {
    const search = String(req.query.search || '').trim();
    const group = String(req.query.group || '').trim();
    const page = Math.max(Number.parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit || '50', 10), 1), 500);
    const includeInactive = req.query.includeInactive === 'true';

    // contains ของ Prisma บน SQLite = LIKE ซึ่งไม่สนตัวพิมพ์ (ASCII) อยู่แล้ว
    // — พฤติกรรมเดียวกับที่โค้ดเดิมทำด้วย LOWER() สองฝั่ง
    const where = {
      ...(includeInactive ? {} : { is_active: true }),
      ...(group ? { group_id: group } : {}), // group_id เป็น text ห้าม cast เลข (เลขศูนย์นำหน้ามีความหมาย)
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

    // ?lowStock=true — กรอง "สต็อกต่ำ" ที่ฝั่ง server (การ์ดบน Dashboard ลิงก์มาที่โหมดนี้)
    // ยอดคงเหลือไม่มีคอลัมน์เก็บ จึง WHERE ตรงๆ ใน SQL ไม่ได้ — ต้องคำนวณก่อนแล้วค่อยกรองด้วย
    // รายชื่อรหัส: สแกนเฉพาะตัวที่ตั้ง min_stock แล้ว (ตัวที่ NULL ไม่มีทางเป็น Low Stock ตามข้อ 6.8)
    // แล้วใช้กติกา listLowStockIds ตัวเดียวกับที่ dashboard ใช้นับ — เลขการ์ดกับรายการนี้จึงตรงกันเสมอ
    // groupBy กรองผ่าน relation (ไม่ยัด IN-list ยาวๆ) กันชน parameter limit ของ SQLite (P2029)
    if (req.query.lowStock === 'true') {
      const flaggedItems = await prisma.item.findMany({
        where: { is_active: true, min_stock: { not: null } },
        select: { item_id: true, min_stock: true }
      });
      const flaggedSums = flaggedItems.length === 0
        ? []
        : await prisma.stockTransaction.groupBy({
            by: ['item_id'],
            where: { item: { is_active: true, min_stock: { not: null } } },
            _sum: { qty_change: true }
          });
      // IN-list ตรงนี้ปลอดภัย: เหลือเฉพาะตัวที่ Low Stock จริง ซึ่งมีจำนวนน้อยตามธรรมชาติ
      where.item_id = { in: listLowStockIds(flaggedItems, buildStockMap(flaggedSums)) };
    }

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

    broadcast('products');
    if (created.docNo) broadcast('transactions'); // มียอดตั้งต้น = ออกใบ RECEIVE ให้อัตโนมัติ 1 ใบ

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

    broadcast('products');
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

    broadcast('products');
    return res.json({ success: true, message: 'ปิดใช้งานสินค้าเรียบร้อย' });
  } catch (error) {
    console.error('deleteProduct Error:', error);
    return res.status(500).json({ success: false, message: 'Database error' });
  }
};

// คืนสถานะสินค้าที่ถูกปิดใช้งาน (Admin เท่านั้น — เท่ากับสิทธิ์ปิดใช้งาน) — idempotent:
// active อยู่แล้วก็ตอบ success เฉยๆ ไม่ log ซ้ำ (updateMany เงื่อนไข is_active:false กันสองแท็บกดพร้อมกัน
// แบบเดียวกับ markPickedUp) ไม่มีปุ่ม "ลบถาวร" คู่กัน — soft delete ของเราออกแบบให้ restore กลับได้เสมอ
export const restoreProduct = async (req, res) => {
  try {
    const itemId = trimmedId(req.params.id);
    const existing = await prisma.item.findUnique({ where: { item_id: itemId }, select: { item_id: true } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'ไม่พบสินค้า' });
    }

    const updated = await prisma.item.updateMany({
      where: { item_id: itemId, is_active: false },
      data: { is_active: true }
    });
    if (updated.count > 0) {
      await tryLogAudit(req.user?.id, 'product.restore', 'product', itemId);
      broadcast('products');
    }

    return res.json({ success: true, message: 'คืนสถานะสินค้าเรียบร้อย' });
  } catch (error) {
    console.error('restoreProduct Error:', error);
    return res.status(500).json({ success: false, message: 'Database error' });
  }
};

// bulkImportProducts ถูกถอดออกตามการตัดสินใจข้อ 11 — ช่องนำเข้าที่รับรหัสจากไฟล์ตรงๆ
// คือประตูหลังเลี่ยงระบบออกรหัสตามกลุ่ม (โค้ดเดิมดูได้จาก git history ถ้ามีเหตุต้องฟื้น)

// ---------------------------------------------------------------------------
// สถิติหน้า Homepage — ย้ายมาฐานใหม่แล้ว (ส่วน 3) ทรง JSON คงเดิมทั้ง 3 ก้อน (stats/activities/stockLevels)
// ตามคำขอ "ทำให้เหมือนต้นฉบับก่อนย้ายฐาน" — ยกเว้น 2 จุดที่ทำตามเป๊ะไม่ได้ (กติกาที่ล็อกไปแล้วในเส้นอื่น):
//   1) lowStockCount/stockLevels.minStock ไม่ default เป็น 10 เมื่อยังไม่ตั้งเกณฑ์ (คง NULL) — DATABASE.md ข้อ 6.8
//      ผลคือ lowStockCount นับเฉพาะสินค้าที่ตั้งเกณฑ์แล้วและติด 'Low Stock' จริง (computeStatus เดียวกับหน้า
//      Products/Inventory) ไม่ปนกับ 'Out of Stock' (ของหมด) แบบที่ SQL เดิมเคยนับรวมกันเป็นตัวเลขเดียว
//   2) activities ใช้ mapDocumentToTransaction ตัวเดียวกับ /api/transactions (ทรงข้อมูลออกมาตรงกันทั้งแอป)
// ---------------------------------------------------------------------------

export const getDashboardStats = async (req, res) => {
  try {
    // ขอบเขต "วันนี้" ตามเวลาเครื่อง server (แทน SQLite date(x,'localtime') เดิม — พฤติกรรมเดียวกัน)
    const { start: startOfToday, end: startOfTomorrow } = localDayRange();

    // ยอดคงเหลือของสินค้าที่ active ทุกตัว คำนวณครั้งเดียวใช้ร่วมกันทั้ง totalItems/lowStockCount/stockLevels
    const activeItems = await prisma.item.findMany({
      where: { is_active: true },
      select: { item_id: true, name: true, min_stock: true }
    });
    // กรองด้วย relation (item.is_active) ให้ Prisma ทำ JOIN แทนการยัดรหัสสินค้าเป็น IN (...) ยาว 2,382 ตัว
    // — เคยลองแบบ IN-list แล้วชนขีดจำกัดจำนวนพารามิเตอร์ของ SQLite (P2029) เพราะที่นี่ไม่แบ่งหน้าเหมือน getProducts
    const sums = activeItems.length === 0
      ? []
      : await prisma.stockTransaction.groupBy({
          by: ['item_id'],
          where: { item: { is_active: true } },
          _sum: { qty_change: true }
        });
    const stockMap = buildStockMap(sums);

    const totalItems = activeItems.reduce((sum, item) => sum + stockOf(stockMap, item.item_id), 0);
    const lowStockCount = countLowStock(activeItems, stockMap);
    const stockLevels = activeItems
      .map((item) => ({ sku: item.item_id, name: item.name, stock: stockOf(stockMap, item.item_id), minStock: item.min_stock ?? null }))
      .sort((a, b) => a.stock - b.stock)
      .slice(0, 10);

    const [inboundAgg, outboundAgg] = await Promise.all([
      prisma.stockTransaction.aggregate({
        _sum: { qty_change: true },
        where: { type: 'IN', transaction_date: { gte: startOfToday, lt: startOfTomorrow } }
      }),
      prisma.stockTransaction.aggregate({
        _sum: { qty_change: true },
        where: { type: 'OUT', transaction_date: { gte: startOfToday, lt: startOfTomorrow } }
      })
    ]);

    const stats = {
      totalItems,
      lowStockCount,
      inboundToday: inboundAgg._sum.qty_change ?? 0,
      // OUT เก็บเป็นค่าติดลบเสมอ — พลิกกลับเป็นบวกให้ตรงทรงเดิม (Homepage เติมเครื่องหมาย "-" เองใน JSX)
      outboundToday: -(outboundAgg._sum.qty_change ?? 0)
    };

    // 10 รายการล่าสุด (เรียงตาม "แตะล่าสุด" คือ resolved_at ถ้ามี ไม่งั้น created_at — ตรงกับ SQL เดิม
    // ที่ ORDER BY COALESCE(resolvedDate, requestDate) DESC) — ดึงมาเผื่อ 30 ใบกันเคสใบเก่าที่เพิ่งปิดตกไป
    const recentDocs = await prisma.stockDocument.findMany({
      include: DOCUMENT_INCLUDE,
      orderBy: { created_at: 'desc' },
      take: 30
    });
    const activities = recentDocs
      .map(mapDocumentToTransaction)
      .sort((a, b) => new Date(b.resolvedDate ?? b.requestDate) - new Date(a.resolvedDate ?? a.requestDate))
      .slice(0, 10)
      .map((t) => ({
        transactionId: t.transactionId,
        type: t.type,
        requesterUsername: t.requesterUsername,
        project: t.project,
        status: t.status,
        requestDate: t.requestDate,
        resolvedDate: t.resolvedDate,
        adminUsername: t.adminUsername
      }));

    return res.status(200).json({ success: true, stats, activities, stockLevels });
  } catch (error) {
    console.error('getDashboardStats Error:', error);
    res.status(500).json({ success: false, message: 'Database error' });
  }
};
