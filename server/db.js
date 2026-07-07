import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, 'identifier.sqlite');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS item_groups (
    group_id TEXT PRIMARY KEY,
    group_name TEXT NOT NULL,
    description TEXT
  );

  CREATE TABLE IF NOT EXISTS items (
    item_id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL,
    item_seq TEXT NOT NULL,
    item_name TEXT NOT NULL,
    unit TEXT,
    latest_cost REAL,
    is_asset INTEGER,
    storage_type TEXT,
    vendor TEXT,
    clean_status TEXT,
    source_row INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES item_groups(group_id)
  );

  CREATE TABLE IF NOT EXISTS stock_in (
    stock_in_id INTEGER PRIMARY KEY AUTOINCREMENT,
    qr_code TEXT,
    period_code TEXT,
    item_id TEXT NOT NULL,
    quantity REAL NOT NULL CHECK(quantity > 0),
    input_date TEXT,
    unit_cost REAL,
    total_cost REAL GENERATED ALWAYS AS (quantity * unit_cost) STORED,
    project TEXT,
    note TEXT,
    source_row INTEGER,
    clean_status TEXT,
    created_by TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES items(item_id)
  );

  CREATE TABLE IF NOT EXISTS stock_out (
    stock_out_id INTEGER PRIMARY KEY AUTOINCREMENT,
    qr_code TEXT,
    period_code TEXT,
    item_id TEXT NOT NULL,
    quantity REAL NOT NULL CHECK(quantity > 0),
    input_date TEXT,
    output_date TEXT,
    days_held INTEGER,
    unit_cost REAL,
    total_cost REAL GENERATED ALWAYS AS (quantity * unit_cost) STORED,
    project TEXT,
    note TEXT,
    source_row INTEGER,
    clean_status TEXT,
    created_by TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES items(item_id)
  );

  CREATE TABLE IF NOT EXISTS data_quality_issues (
    issue_id INTEGER PRIMARY KEY AUTOINCREMENT,
    severity TEXT,
    source_sheet TEXT,
    source_row INTEGER,
    field_name TEXT,
    original_value TEXT,
    issue_description TEXT,
    action_taken TEXT,
    resolved INTEGER DEFAULT 0,
    resolved_by TEXT,
    resolved_at TEXT
  );

  CREATE TABLE IF NOT EXISTS product_settings (
    item_id TEXT PRIMARY KEY,
    min_stock INTEGER NOT NULL DEFAULT 10 CHECK(min_stock >= 0),
    image_url TEXT DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES items(item_id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS app_users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('Admin', 'Manager', 'Operator')),
    status TEXT NOT NULL CHECK(status IN ('Pending', 'Active', 'Denied')),
    avatarUrl TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at INTEGER,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS wms_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transactionId TEXT UNIQUE,
    type TEXT NOT NULL CHECK(type IN ('INBOUND', 'OUTBOUND', 'ADJUSTMENT', 'RETURN')),
    requesterUsername TEXT,
    project TEXT,
    status TEXT NOT NULL CHECK(status IN ('Pending', 'Approved', 'Partial', 'Rejected', 'Cancelled')),
    requestDate TEXT,
    resolvedDate TEXT,
    adminUsername TEXT,
    adminMessage TEXT
  );

  CREATE TABLE IF NOT EXISTS wms_transaction_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tx_id INTEGER NOT NULL,
    productId TEXT NOT NULL,
    sku TEXT,
    productName TEXT,
    imageUrl TEXT,
    requestedQty INTEGER NOT NULL CHECK(requestedQty >= 0),
    approvedQty INTEGER NOT NULL DEFAULT 0 CHECK(approvedQty >= 0),
    status TEXT NOT NULL CHECK(status IN ('Pending', 'Approved', 'Rejected', 'Partial')),
    FOREIGN KEY(tx_id) REFERENCES wms_transactions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_username TEXT,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    details TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

// กลุ่มสินค้าเริ่มต้นสำหรับ item ที่สร้างเองโดยไม่ระบุกลุ่ม
db.prepare(`
  INSERT OR IGNORE INTO item_groups (group_id, group_name, description)
  VALUES ('00', 'Default', 'Default group for manually created items')
`).run();

// View สรุปยอดคงเหลือ: ยอดรับเข้า - ยอดเบิกออก ต่อ item
db.exec(`
  CREATE VIEW IF NOT EXISTS warehouse_balance AS
  WITH in_sum AS (
    SELECT item_id, SUM(quantity) AS qty_in
    FROM stock_in
    GROUP BY item_id
  ),
  out_sum AS (
    SELECT item_id, SUM(quantity) AS qty_out
    FROM stock_out
    GROUP BY item_id
  )
  SELECT
    i.item_id,
    i.item_name,
    i.unit,
    g.group_name,
    COALESCE(ins.qty_in, 0) AS qty_in,
    COALESCE(outs.qty_out, 0) AS qty_out,
    (COALESCE(ins.qty_in, 0) - COALESCE(outs.qty_out, 0)) AS stock_balance,
    i.latest_cost,
    ((COALESCE(ins.qty_in, 0) - COALESCE(outs.qty_out, 0)) * i.latest_cost) AS stock_value,
    CASE
      WHEN (COALESCE(ins.qty_in, 0) - COALESCE(outs.qty_out, 0)) < 0 THEN 'Negative stock'
      ELSE NULL
    END AS warning
  FROM items i
  LEFT JOIN item_groups g ON i.group_id = g.group_id
  LEFT JOIN in_sum ins ON i.item_id = ins.item_id
  LEFT JOIN out_sum outs ON i.item_id = outs.item_id;
`);

export const logAudit = (actorUsername, action, entityType, entityId, details = {}) => {
  db.prepare(`
    INSERT INTO audit_logs (actor_username, action, entity_type, entity_id, details)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    actorUsername || null,
    action,
    entityType || null,
    entityId == null ? null : String(entityId),
    JSON.stringify(details)
  );
};

export default db;
