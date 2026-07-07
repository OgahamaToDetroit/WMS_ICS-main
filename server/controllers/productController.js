import db, { logAudit } from '../db.js';

const normalizeSku = (value) => String(value || '').trim().toUpperCase();
const toNonNegativeInteger = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
};
const toPositiveNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const mapProduct = (row) => {
  const minStock = Number(row.minStock ?? 10);
  const stock = Number(row.stock ?? 0);
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    unit: row.unit || '',
    groupName: row.groupName || '',
    vendor: row.vendor || '',
    latestCost: row.latestCost ?? null,
    minStock,
    stock,
    imageUrl: row.imageUrl || '',
    warning: row.warning || null,
    status: stock > minStock ? 'Active' : (stock > 0 ? 'Low Stock' : 'Out of Stock')
  };
};

const ensureGroup = (groupId = '00', groupName = 'Default') => {
  db.prepare(`
    INSERT OR IGNORE INTO item_groups (group_id, group_name)
    VALUES (?, ?)
  `).run(groupId, groupName);
};

const upsertProductSettings = db.prepare(`
  INSERT INTO product_settings (item_id, min_stock, image_url, is_active, updated_at)
  VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)
  ON CONFLICT(item_id) DO UPDATE SET
    min_stock = excluded.min_stock,
    image_url = excluded.image_url,
    is_active = 1,
    updated_at = CURRENT_TIMESTAMP
`);

export const getProducts = (req, res) => {
  try {
    const search = String(req.query.search || '').trim().toLowerCase();
    const page = Math.max(Number.parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit || '50', 10), 1), 500);
    const offset = (page - 1) * limit;
    const includeInactive = req.query.includeInactive === 'true';

    const whereParts = [
      includeInactive ? '1 = 1' : 'COALESCE(ps.is_active, 1) = 1'
    ];
    const params = {};

    if (search) {
      // ต้องใช้ single quote เท่านั้น — better-sqlite3 ปิด double-quoted string ("" จะถูกตีความเป็นชื่อคอลัมน์แล้ว query พัง)
      whereParts.push("(LOWER(i.item_id) LIKE @search OR LOWER(i.item_name) LIKE @search OR LOWER(COALESCE(i.vendor, '')) LIKE @search)");
      params.search = `%${search}%`;
    }

    const whereSql = whereParts.join(' AND ');
    const totalItems = db.prepare(`
      SELECT COUNT(*) AS count
      FROM items i
      LEFT JOIN product_settings ps ON ps.item_id = i.item_id
      WHERE ${whereSql}
    `).get(params).count;

    const rows = db.prepare(`
      SELECT
        i.item_id AS id,
        i.item_id AS sku,
        i.item_name AS name,
        i.unit,
        i.vendor,
        i.latest_cost AS latestCost,
        wb.group_name AS groupName,
        COALESCE(wb.stock_balance, 0) AS stock,
        COALESCE(ps.min_stock, 10) AS minStock,
        COALESCE(ps.image_url, '') AS imageUrl,
        wb.warning
      FROM items i
      LEFT JOIN warehouse_balance wb ON i.item_id = wb.item_id
      LEFT JOIN product_settings ps ON ps.item_id = i.item_id
      WHERE ${whereSql}
      ORDER BY i.item_name COLLATE NOCASE ASC
      LIMIT @limit OFFSET @offset
    `).all({ ...params, limit, offset });

    return res.status(200).json({
      success: true,
      products: rows.map(mapProduct),
      page,
      totalPages: Math.max(Math.ceil(totalItems / limit), 1),
      totalItems
    });
  } catch (error) {
    console.error('getProducts Error:', error);
    res.status(500).json({ success: false, message: 'Database error' });
  }
};

export const createProduct = (req, res) => {
  try {
    const sku = normalizeSku(req.body.sku);
    const name = String(req.body.name || '').trim();
    const groupId = String(req.body.groupId || '00').trim() || '00';
    const groupName = String(req.body.groupName || 'Default').trim() || 'Default';
    const unit = String(req.body.unit || '').trim();
    const vendor = String(req.body.vendor || '').trim();
    const imageUrl = String(req.body.imageUrl || '').trim();
    const minStock = toNonNegativeInteger(req.body.minStock, 10);
    const latestCost = Number.isFinite(Number(req.body.latestCost)) ? Number(req.body.latestCost) : null;
    const initialStock = toPositiveNumber(req.body.initialStock);
    const now = new Date().toISOString();

    if (!sku || !name) {
      return res.status(400).json({ success: false, message: 'กรุณาระบุ SKU และชื่อสินค้า' });
    }

    const exists = db.prepare('SELECT item_id FROM items WHERE item_id = ?').get(sku);
    if (exists) {
      return res.status(409).json({ success: false, message: 'SKU นี้มีอยู่ในระบบแล้ว' });
    }

    db.transaction(() => {
      ensureGroup(groupId, groupName);
      db.prepare(`
        INSERT INTO items (item_id, group_id, item_seq, item_name, unit, latest_cost, vendor, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(sku, groupId, sku.slice(-3).padStart(3, '0'), name, unit || null, latestCost, vendor || null, now, now);
      upsertProductSettings.run(sku, minStock, imageUrl);
      if (initialStock) {
        db.prepare(`
          INSERT INTO stock_in (item_id, quantity, input_date, note)
          VALUES (?, ?, ?, ?)
        `).run(sku, initialStock, now, 'Initial stock');
      }
      logAudit(req.user?.username, 'product.create', 'product', sku, { name, minStock, initialStock: initialStock || 0 });
    })();

    return res.status(201).json({ success: true, message: 'สร้างสินค้าเรียบร้อย' });
  } catch (error) {
    console.error('createProduct Error:', error);
    res.status(500).json({ success: false, message: 'Database error' });
  }
};

export const updateProduct = (req, res) => {
  try {
    const sku = normalizeSku(req.params.id);
    const existing = db.prepare('SELECT * FROM items WHERE item_id = ?').get(sku);

    if (!existing) {
      return res.status(404).json({ success: false, message: 'ไม่พบสินค้า' });
    }

    const name = String(req.body.name ?? existing.item_name).trim();
    const groupId = String(req.body.groupId || existing.group_id || '00').trim() || '00';
    const groupName = String(req.body.groupName || 'Default').trim() || 'Default';
    const unit = String(req.body.unit ?? existing.unit ?? '').trim();
    const vendor = String(req.body.vendor ?? existing.vendor ?? '').trim();
    const imageUrl = String(req.body.imageUrl ?? '').trim();
    const minStock = toNonNegativeInteger(req.body.minStock, 10);
    const latestCost = req.body.latestCost === '' || req.body.latestCost == null ? existing.latest_cost : Number(req.body.latestCost);

    if (!name) {
      return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อสินค้า' });
    }

    db.transaction(() => {
      ensureGroup(groupId, groupName);
      db.prepare(`
        UPDATE items
        SET group_id = ?, item_name = ?, unit = ?, latest_cost = ?, vendor = ?, updated_at = CURRENT_TIMESTAMP
        WHERE item_id = ?
      `).run(groupId, name, unit || null, Number.isFinite(latestCost) ? latestCost : null, vendor || null, sku);
      upsertProductSettings.run(sku, minStock, imageUrl);
      logAudit(req.user?.username, 'product.update', 'product', sku, { name, minStock });
    })();

    return res.json({ success: true, message: 'อัปเดตสินค้าเรียบร้อย' });
  } catch (error) {
    console.error('updateProduct Error:', error);
    res.status(500).json({ success: false, message: 'Database error' });
  }
};

export const deleteProduct = (req, res) => {
  try {
    const sku = normalizeSku(req.params.id);
    const existing = db.prepare('SELECT item_id FROM items WHERE item_id = ?').get(sku);
    if (!existing) return res.status(404).json({ success: false, message: 'ไม่พบสินค้า' });

    // Soft delete: ปิดการมองเห็นสินค้าแทนการลบจริง เพื่อคงประวัติ stock_in/stock_out ไว้
    db.prepare(`
      INSERT INTO product_settings (item_id, is_active)
      VALUES (?, 0)
      ON CONFLICT(item_id) DO UPDATE SET is_active = 0, updated_at = CURRENT_TIMESTAMP
    `).run(sku);
    logAudit(req.user?.username, 'product.archive', 'product', sku);

    return res.json({ success: true, message: 'ปิดใช้งานสินค้าเรียบร้อย' });
  } catch (error) {
    console.error('deleteProduct Error:', error);
    res.status(500).json({ success: false, message: 'Database error' });
  }
};

export const bulkImportProducts = (req, res) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    if (rows.length === 0) {
      return res.status(400).json({ success: false, message: 'ไม่พบข้อมูลสำหรับนำเข้า' });
    }

    let created = 0;
    let updated = 0;
    const skipped = [];
    const now = new Date().toISOString();

    db.transaction(() => {
      rows.forEach((row, index) => {
        const sku = normalizeSku(row.sku || row.item_id || row['SKU']);
        const name = String(row.name || row.item_name || row['Name'] || '').trim();
        if (!sku || !name) {
          skipped.push({ row: index + 1, reason: 'Missing SKU or name' });
          return;
        }

        const groupId = String(row.groupId || row.group_id || '00').trim() || '00';
        const groupName = String(row.groupName || row.group_name || 'Default').trim() || 'Default';
        const minStock = toNonNegativeInteger(row.minStock ?? row.min_stock, 10);
        const imageUrl = String(row.imageUrl || row.image_url || '').trim();
        const unit = String(row.unit || '').trim();
        const vendor = String(row.vendor || '').trim();
        const latestCost = Number.isFinite(Number(row.latestCost ?? row.latest_cost)) ? Number(row.latestCost ?? row.latest_cost) : null;
        const existing = db.prepare('SELECT item_id FROM items WHERE item_id = ?').get(sku);

        ensureGroup(groupId, groupName);
        if (existing) {
          db.prepare(`
            UPDATE items
            SET group_id = ?, item_name = ?, unit = ?, vendor = ?, latest_cost = ?, updated_at = CURRENT_TIMESTAMP
            WHERE item_id = ?
          `).run(groupId, name, unit || null, vendor || null, latestCost, sku);
          updated += 1;
        } else {
          db.prepare(`
            INSERT INTO items (item_id, group_id, item_seq, item_name, unit, vendor, latest_cost, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(sku, groupId, sku.slice(-3).padStart(3, '0'), name, unit || null, vendor || null, latestCost, now, now);
          created += 1;
        }
        upsertProductSettings.run(sku, minStock, imageUrl);
      });
      logAudit(req.user?.username, 'product.bulk_import', 'product', null, { created, updated, skipped: skipped.length });
    })();

    return res.json({ success: true, created, updated, skipped });
  } catch (error) {
    console.error('bulkImportProducts Error:', error);
    res.status(500).json({ success: false, message: 'Database error' });
  }
};

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
