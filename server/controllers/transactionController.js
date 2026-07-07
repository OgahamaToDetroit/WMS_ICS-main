import db, { logAudit } from '../db.js';

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.statusCode = 400;
  }
}

const toPositiveInteger = (value) => {
  const numberValue = Number(value);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : null;
};

const toNonNegativeInteger = (value) => {
  const numberValue = Number(value);
  return Number.isInteger(numberValue) && numberValue >= 0 ? numberValue : null;
};

const normalizeSku = (value) => String(value || '').trim().toUpperCase();

const getCurrentStock = (itemId) => {
  // item_id เป็น TEXT เสมอ แต่บาง record เก็บ productId มาเป็นตัวเลข (ตารางสคีมาเก่า)
  // ต้อง cast เป็น String ก่อน ไม่งั้น view จะเทียบคนละ storage class (เลข != ข้อความ) แล้วหาสต็อกไม่เจอ
  const row = db.prepare('SELECT stock_balance FROM warehouse_balance WHERE item_id = ?').get(String(itemId));
  return Number(row?.stock_balance || 0);
};

const getFullTransactions = () => {
  const txs = db.prepare('SELECT * FROM wms_transactions ORDER BY requestDate DESC').all();
  // ถ้ารายการไหนบันทึกไว้โดยไม่มีรูป ให้ fallback ไปใช้รูปปัจจุบันของสินค้าใน product_settings
  const items = db.prepare(`
    SELECT ti.*, COALESCE(NULLIF(ti.imageUrl, ''), ps.image_url, '') AS imageUrl
    FROM wms_transaction_items ti
    LEFT JOIN product_settings ps ON ps.item_id = ti.productId
    ORDER BY ti.id ASC
  `).all();

  return txs.map(tx => ({
    ...tx,
    items: items.filter(i => i.tx_id === tx.id).map(i => ({
      productId: i.productId,
      sku: i.sku,
      productName: i.productName,
      imageUrl: i.imageUrl,
      requestedQty: i.requestedQty,
      approvedQty: i.approvedQty,
      status: i.status
    }))
  }));
};

const handleError = (res, err) => {
  console.error(err);
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({ success: false, message: statusCode === 500 ? 'Database error' : err.message });
};

export const getTransactions = (req, res) => {
  try {
    const transactions = getFullTransactions();
    const isManagerOrAdmin = ['Admin', 'Manager'].includes(req.user.role);
    const visibleData = isManagerOrAdmin ? transactions : transactions.filter(t => t.requesterUsername === req.user.username);
    res.json({ success: true, transactions: visibleData });
  } catch (err) {
    handleError(res, err);
  }
};

export const getHistory = (req, res) => {
  try {
    const transactions = getFullTransactions();
    const isManagerOrAdmin = ['Admin', 'Manager'].includes(req.user.role);
    const visibleData = isManagerOrAdmin ? transactions : transactions.filter(t => t.requesterUsername === req.user.username);
    const history = visibleData.filter(t => t.status !== 'Pending');
    res.json({ success: true, history });
  } catch (err) {
    handleError(res, err);
  }
};

export const createOutboundRequest = (req, res) => {
  try {
    const { items, project } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      throw new ValidationError('ไม่มีรายการสินค้า');
    }
    if (!project || String(project).trim() === '') {
      throw new ValidationError('กรุณาระบุโปรเจกต์');
    }

    const normalizedItems = items.map((item) => {
      const productId = normalizeSku(item.productId || item.sku);
      const reqQty = toPositiveInteger(item.quantity);
      if (!productId || !reqQty) throw new ValidationError('จำนวนเบิกไม่ถูกต้อง');

      const product = db.prepare(`
        SELECT i.item_id, i.item_name, COALESCE(ps.image_url, '') AS imageUrl
        FROM items i
        LEFT JOIN product_settings ps ON ps.item_id = i.item_id
        WHERE i.item_id = ? AND COALESCE(ps.is_active, 1) = 1
      `).get(productId);
      if (!product) throw new ValidationError(`ไม่พบสินค้า ${productId}`);

      const stock = getCurrentStock(productId);
      if (reqQty > stock) throw new ValidationError(`สินค้า ${productId} มีคงเหลือไม่พอ`);

      return {
        productId,
        sku: product.item_id,
        productName: product.item_name,
        imageUrl: product.imageUrl || item.imageUrl || '',
        quantity: reqQty
      };
    });

    const requestDate = new Date().toISOString();
    const transactionId = `REQ-${Date.now()}`;

    db.transaction(() => {
      const info = db.prepare(`
        INSERT INTO wms_transactions (transactionId, type, requesterUsername, project, status, requestDate)
        VALUES (?, 'OUTBOUND', ?, ?, 'Pending', ?)
      `).run(transactionId, req.user.username, String(project).trim(), requestDate);

      const stmtItem = db.prepare(`
        INSERT INTO wms_transaction_items (tx_id, productId, sku, productName, imageUrl, requestedQty, approvedQty, status)
        VALUES (?, ?, ?, ?, ?, ?, 0, 'Pending')
      `);

      for (const item of normalizedItems) {
        stmtItem.run(info.lastInsertRowid, item.productId, item.sku, item.productName, item.imageUrl, item.quantity);
      }
      logAudit(req.user.username, 'transaction.request_outbound', 'transaction', transactionId, {
        project: String(project).trim(),
        itemCount: normalizedItems.length
      });
    })();

    res.status(201).json({ success: true, message: 'ส่งคำขอเบิกแบบชุดสำเร็จ', transactionId });
  } catch (err) {
    handleError(res, err);
  }
};

export const createInboundTransaction = (req, res) => {
  try {
    const { name, quantity, note, minStock, imageUrl, project } = req.body;
    const inboundQty = toPositiveInteger(quantity);
    const normalizedSku = normalizeSku(req.body.sku);

    if (!normalizedSku || !inboundQty) {
      throw new ValidationError('ข้อมูลไม่ครบถ้วน');
    }

    const requestDate = new Date().toISOString();
    const transactionId = `INB-${Date.now()}`;

    db.transaction(() => {
      let item = db.prepare('SELECT item_id, item_name FROM items WHERE item_id = ?').get(normalizedSku);
      if (!item) {
        db.prepare(`
          INSERT INTO items (item_id, item_name, group_id, item_seq, created_at, updated_at)
          VALUES (?, ?, '00', '000', ?, ?)
        `).run(normalizedSku, name || normalizedSku, requestDate, requestDate);
        item = { item_id: normalizedSku, item_name: name || normalizedSku };
      } else if (name && name !== item.item_name) {
        db.prepare('UPDATE items SET item_name = ?, updated_at = CURRENT_TIMESTAMP WHERE item_id = ?')
          .run(name, normalizedSku);
        item.item_name = name;
      }

      if (minStock != null || imageUrl != null) {
        db.prepare(`
          INSERT INTO product_settings (item_id, min_stock, image_url, is_active, updated_at)
          VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)
          ON CONFLICT(item_id) DO UPDATE SET
            min_stock = COALESCE(excluded.min_stock, product_settings.min_stock),
            image_url = COALESCE(excluded.image_url, product_settings.image_url),
            is_active = 1,
            updated_at = CURRENT_TIMESTAMP
        `).run(
          normalizedSku,
          minStock == null ? null : Math.max(Number.parseInt(minStock, 10) || 0, 0),
          imageUrl == null ? null : String(imageUrl)
        );
      } else {
        db.prepare(`
          INSERT OR IGNORE INTO product_settings (item_id, min_stock, image_url, is_active)
          VALUES (?, 10, '', 1)
        `).run(normalizedSku);
      }

      db.prepare(`
        INSERT INTO stock_in (item_id, quantity, input_date, project, note, created_by)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(normalizedSku, inboundQty, requestDate, project || null, note || null, req.user.username);

      const txInfo = db.prepare(`
        INSERT INTO wms_transactions (transactionId, type, requesterUsername, project, status, requestDate, resolvedDate, adminUsername)
        VALUES (?, 'INBOUND', ?, ?, 'Approved', ?, ?, ?)
      `).run(transactionId, req.user.username, note || project || 'รับอะไหล่เข้า', requestDate, requestDate, req.user.username);

      // ถ้าคำขอไม่ได้แนบรูปมา ใช้รูปที่ตั้งค่าไว้แล้วของสินค้าตัวนี้แทน เพื่อให้ประวัติแสดงรูปได้
      const finalImageUrl = imageUrl
        || db.prepare('SELECT image_url FROM product_settings WHERE item_id = ?').get(normalizedSku)?.image_url
        || '';

      db.prepare(`
        INSERT INTO wms_transaction_items (tx_id, productId, sku, productName, imageUrl, requestedQty, approvedQty, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'Approved')
      `).run(txInfo.lastInsertRowid, normalizedSku, normalizedSku, item.item_name, finalImageUrl, inboundQty, inboundQty);

      logAudit(req.user.username, 'transaction.inbound', 'transaction', transactionId, { sku: normalizedSku, quantity: inboundQty });
    })();

    res.status(201).json({ success: true, message: 'บันทึกรับเข้าสำเร็จ', transactionId });
  } catch (err) {
    handleError(res, err);
  }
};

export const resolveTransaction = (req, res) => {
  try {
    const { id } = req.params;
    const { action, updatedItems, adminMessage } = req.body;
    const resolvedDate = new Date().toISOString();
    const trimmedMessage = String(adminMessage || '').trim();

    if (!['APPROVE', 'REJECT'].includes(action)) {
      throw new ValidationError('action ไม่ถูกต้อง');
    }

    if (action === 'REJECT' && !trimmedMessage) {
      throw new ValidationError('กรุณาระบุเหตุผลการปฏิเสธใบเบิก');
    }

    const tx = db.prepare('SELECT * FROM wms_transactions WHERE id = ?').get(id);
    if (!tx) return res.status(404).json({ success: false, message: 'ไม่พบรายการ' });
    if (tx.status !== 'Pending') throw new ValidationError('จัดการไปแล้ว');

    const originalItems = db.prepare('SELECT * FROM wms_transaction_items WHERE tx_id = ? ORDER BY id ASC').all(id);
    if (originalItems.length === 0) throw new ValidationError('ไม่พบสินค้าในใบเบิก');

    const requestedUpdates = new Map(
      (Array.isArray(updatedItems) ? updatedItems : []).map(item => [normalizeSku(item.productId || item.sku), item])
    );

    db.transaction(() => {
      if (action === 'REJECT') {
        db.prepare(`
          UPDATE wms_transactions
          SET status = 'Rejected', resolvedDate = ?, adminUsername = ?, adminMessage = ?
          WHERE id = ?
        `).run(resolvedDate, req.user.username, trimmedMessage, id);
        db.prepare(`UPDATE wms_transaction_items SET status = 'Rejected', approvedQty = 0 WHERE tx_id = ?`).run(id);
        logAudit(req.user.username, 'transaction.reject', 'transaction', tx.transactionId, { adminMessage: trimmedMessage });
        return;
      }

      let allApprovedFull = true;
      let anyApproved = false;
      const updateItemStmt = db.prepare(`
        UPDATE wms_transaction_items
        SET approvedQty = ?, status = ?
        WHERE id = ?
      `);
      const insertStockOut = db.prepare(`
        INSERT INTO stock_out (item_id, quantity, output_date, project, note, created_by)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (const originalItem of originalItems) {
        const requestItem = requestedUpdates.get(normalizeSku(originalItem.productId));
        const requestedApprovedQty = requestItem ? requestItem.approvedQty : originalItem.requestedQty;
        const appQty = toNonNegativeInteger(requestedApprovedQty);

        if (appQty == null) throw new ValidationError(`จำนวนอนุมัติของ ${originalItem.sku} ไม่ถูกต้อง`);
        if (appQty > originalItem.requestedQty) throw new ValidationError(`อนุมัติ ${originalItem.sku} เกินจำนวนที่ขอ`);

        const currentStock = getCurrentStock(originalItem.productId);
        if (appQty > currentStock) throw new ValidationError(`สินค้า ${originalItem.sku} มีคงเหลือไม่พอ`);

        let itemStatus = 'Rejected';
        if (appQty > 0) {
          anyApproved = true;
          itemStatus = appQty === originalItem.requestedQty ? 'Approved' : 'Partial';
          insertStockOut.run(String(originalItem.productId), appQty, resolvedDate, tx.project, trimmedMessage || null, req.user.username);
        }

        if (appQty < originalItem.requestedQty) allApprovedFull = false;
        updateItemStmt.run(appQty, itemStatus, originalItem.id);
      }

      // อนุมัติไม่ครบตามที่ขอ (บางส่วน/ตัดเหลือศูนย์) ต้องบอกเหตุผลให้ผู้ขอเบิกรับทราบเสมอ
      if (!allApprovedFull && !trimmedMessage) {
        throw new ValidationError('กรุณาระบุเหตุผลเมื่ออนุมัติไม่ครบตามจำนวนที่ขอ');
      }

      const finalStatus = anyApproved ? (allApprovedFull ? 'Approved' : 'Partial') : 'Rejected';
      db.prepare(`
        UPDATE wms_transactions
        SET status = ?, resolvedDate = ?, adminUsername = ?, adminMessage = ?
        WHERE id = ?
      `).run(finalStatus, resolvedDate, req.user.username, trimmedMessage, id);
      logAudit(req.user.username, 'transaction.resolve', 'transaction', tx.transactionId, { finalStatus });
    })();

    res.json({ success: true, message: 'พิจารณาใบเบิกเสร็จสิ้น' });
  } catch (err) {
    handleError(res, err);
  }
};

export const cancelTransaction = (req, res) => {
  try {
    const { id } = req.params;
    const tx = db.prepare('SELECT * FROM wms_transactions WHERE id = ?').get(id);

    if (!tx) return res.status(404).json({ success: false, message: 'ไม่พบรายการ' });
    if (tx.status !== 'Pending') throw new ValidationError('ยกเลิกได้เฉพาะรายการที่รออนุมัติ');

    const isOwner = tx.requesterUsername === req.user.username;
    const isManagerOrAdmin = ['Admin', 'Manager'].includes(req.user.role);
    if (!isOwner && !isManagerOrAdmin) return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์ยกเลิกรายการนี้' });

    db.transaction(() => {
      db.prepare(`
        UPDATE wms_transactions
        SET status = 'Cancelled', resolvedDate = ?, adminUsername = ?, adminMessage = ?
        WHERE id = ?
      `).run(new Date().toISOString(), req.user.username, req.body?.message || 'Cancelled', id);
      db.prepare(`UPDATE wms_transaction_items SET status = 'Rejected', approvedQty = 0 WHERE tx_id = ?`).run(id);
      logAudit(req.user.username, 'transaction.cancel', 'transaction', tx.transactionId);
    })();

    res.json({ success: true, message: 'ยกเลิกคำขอเรียบร้อย' });
  } catch (err) {
    handleError(res, err);
  }
};
