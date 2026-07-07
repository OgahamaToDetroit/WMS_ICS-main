# คู่มือ SQL — Database คลังสินค้า (`warehouse.db`)

> **เอกสารนี้คืออะไร:** คู่มืออ้างอิงคำสั่ง SQL ของทุกตารางในฐานข้อมูลนี้ — โครงสร้างตารางจริง (`CREATE TABLE`), ความหมายของทุกคอลัมน์, กุญแจ/ดัชนี/ความสัมพันธ์, และตัวอย่างคำสั่งที่ใช้บ่อย (`SELECT`/`INSERT`/`UPDATE`)
>
> `CREATE TABLE` ทุกอันในไฟล์นี้ **ดึงจาก `warehouse.db` จริง** (ผ่าน `sqlite_master`) ไม่ใช่เขียนมือ จึงตรงกับฐานข้อมูลเป๊ะ — ถ้าแก้ schema แล้ว dump ใหม่ได้ด้วยคำสั่งท้ายไฟล์ (ข้อ 9)
>
> เอกสารพี่น้อง: [`data_dictionary.md`](data_dictionary.md) (อธิบายเชิงแนวคิดลึกกว่า) · [`database_usage_guide.md`](database_usage_guide.md) (ตัวอย่างใช้งานแบบเรื่องราว) · [`data_flow.md`](data_flow.md) (การไหลของข้อมูล ไม่ต้องรู้ SQL)

---

## 0. เปิดฐานข้อมูล

ไฟล์คือ `warehouse.db` (SQLite) อยู่ที่ root ของ repo:

```bash
sqlite3 warehouse.db          # เปิด command line แล้วพิมพ์ SQL ได้เลย
```

คำสั่งช่วยของ `sqlite3` ที่ใช้บ่อย:

```sql
.tables                        -- ดูรายชื่อตารางทั้งหมด
.schema stock_transactions     -- ดู CREATE TABLE ของตารางที่ระบุ
.headers on                    -- ให้ผลลัพธ์โชว์ชื่อคอลัมน์
.mode column                   -- จัดผลลัพธ์เป็นคอลัมน์อ่านง่าย
PRAGMA foreign_keys = ON;      -- เปิดบังคับ foreign key (ดูข้อ 8 — สำคัญ!)
```

---

## 1. ชนิดข้อมูลใน SQLite ที่ต้องเข้าใจก่อน

SQLite เก็บข้อมูลต่างจากฐานข้อมูลอื่นเล็กน้อย รู้ไว้กัน query ผิด:

| ชนิดที่ประกาศไว้ | SQLite เก็บจริงเป็น | ตัวอย่างค่า | ข้อควรระวัง |
|---|---|---|---|
| `TEXT` | ข้อความ | `'02001'` | รหัสทุกตัวเป็น TEXT — ห้าม `CAST` เป็นเลข (เลข 0 นำหน้าหาย) |
| `INTEGER` | จำนวนเต็ม | `1`, `42` | ใช้กับ id ที่ auto รันเลข |
| `REAL` | ทศนิยม | `-1.0`, `3016.85` | ใช้กับจำนวน/ราคา (มีทศนิยมได้) |
| `BOOLEAN` | เก็บเป็น `0`/`1` | `1` = จริง | เขียน `WHERE is_active = 1` ไม่ใช่ `= true` ให้ชัวร์ |
| `DATETIME` | ข้อความ ISO-8601 | `'2026-07-05T15:31:30.535+00:00'` | เทียบวันที่ด้วย string comparison ได้เพราะรูปแบบ ISO เรียงตามเวลาพอดี |

**4 กติกาทองที่ผิดกันบ่อย:**

1. **รหัส (`item_id`, `group_id`) เป็น TEXT เสมอ** — `WHERE item_id = '02001'` (มี quote) ไม่ใช่ `= 2001`
2. **ยอดคงเหลือไม่มีคอลัมน์เก็บ** — คำนวณจาก `SUM(qty_change)` เสมอ (ดูข้อ 7.1)
3. **NULL แปลว่า "ไม่รู้/ไม่มี" ไม่ใช่ 0** — เช่น `latest_cost IS NULL` = ไม่รู้ราคา ต่างจากราคา 0 บาท
4. **คอลัมน์ที่เหมือน enum เป็น TEXT เปล่า ๆ** — SQLite ไม่มี enum จริง database ไม่กันค่าผิด โค้ดต้องคุมเอง:
   - `stock_transactions.type` → `OPENING` `IN` `OUT` `ADJUST`
   - `stock_documents.doc_type` → `RECEIVE` `ISSUE`
   - `stock_documents.status` → `PENDING` `CONFIRMED` `CANCELLED`
   - `users.role` → `STAFF` `REQUESTER`

---

## 2. ตาราง `item_groups` — กลุ่มสินค้า

```sql
CREATE TABLE "item_groups" (
    "group_id"   TEXT NOT NULL PRIMARY KEY,
    "group_name" TEXT NOT NULL,
    "detail"     TEXT
);
```

| คอลัมน์ | ชนิด | ว่างได้? | ความหมาย |
|---|---|---|---|
| `group_id` | TEXT | ไม่ (PK) | รหัสกลุ่ม 2 หลัก เช่น `'01'` — เป็น TEXT กันเลข 0 นำหน้าหาย และตรงกับ 2 ตัวแรกของ `item_id` |
| `group_name` | TEXT | ไม่ | ชื่อกลุ่ม |
| `detail` | TEXT | ได้ | คำอธิบายเพิ่มเติม |

**ตัวอย่าง:**

```sql
-- ดูกลุ่มทั้งหมด
SELECT * FROM item_groups ORDER BY group_id;

-- นับว่าแต่ละกลุ่มมีสินค้ากี่ตัว
SELECT g.group_id, g.group_name, COUNT(i.item_id) AS จำนวนสินค้า
FROM item_groups g
LEFT JOIN items i ON i.group_id = g.group_id
GROUP BY g.group_id, g.group_name
ORDER BY g.group_id;
```

---

## 3. ตาราง `users` — คนคลัง + ผู้ขอเบิก

```sql
CREATE TABLE "users" (
    "id"        INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name"      TEXT NOT NULL,
    "role"      TEXT NOT NULL DEFAULT 'STAFF',
    "is_active" BOOLEAN NOT NULL DEFAULT true
);
```

| คอลัมน์ | ชนิด | ว่างได้? | ความหมาย |
|---|---|---|---|
| `id` | INTEGER | ไม่ (PK, auto) | เลขประจำตัว database ออกให้เอง |
| `name` | TEXT | ไม่ | ชื่อคน |
| `role` | TEXT | ไม่ (default `'STAFF'`) | `STAFF` (คนคลัง — ยืนยัน/ยกเลิกคำขอได้) หรือ `REQUESTER` (ผู้ขอเบิก) |
| `is_active` | BOOLEAN | ไม่ (default `1`) | soft delete — คนลาออกตั้ง `0` ห้ามลบแถวจริง (มีประวัติชี้อยู่) |

> ตารางนี้ **ว่างเปล่า ณ ส่งมอบ** และยังไม่ใช่ระบบ login — repo web จะเติมคอลัมน์ `username` + `password_hash` (bcrypt) ทีหลัง

**ตัวอย่าง:**

```sql
-- เพิ่มคนคลังกับผู้ขอเบิก
INSERT INTO users (name, role) VALUES ('สมหญิง', 'STAFF');
INSERT INTO users (name, role) VALUES ('สมชาย', 'REQUESTER');

-- ดูเฉพาะคนคลังที่ยังใช้งานอยู่
SELECT id, name FROM users WHERE role = 'STAFF' AND is_active = 1;

-- "ลบ" คน = soft delete (ห้าม DELETE จริง)
UPDATE users SET is_active = 0 WHERE id = 2;
```

---

## 4. ตาราง `items` — ทะเบียนสินค้า (master)

```sql
CREATE TABLE "items" (
    "item_id"      TEXT NOT NULL PRIMARY KEY,
    "name"         TEXT NOT NULL,
    "unit"         TEXT,
    "group_id"     TEXT NOT NULL,
    "latest_cost"  REAL,
    "is_asset"     BOOLEAN NOT NULL DEFAULT false,
    "storage_type" TEXT,
    "vendor"       TEXT,
    "note"         TEXT,
    "is_active"    BOOLEAN NOT NULL DEFAULT true,
    "created_at"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   DATETIME NOT NULL,
    CONSTRAINT "items_group_id_fkey" FOREIGN KEY ("group_id")
        REFERENCES "item_groups" ("group_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "items_group_id_idx" ON "items"("group_id");
```

| คอลัมน์ | ชนิด | ว่างได้? | ความหมาย |
|---|---|---|---|
| `item_id` | TEXT | ไม่ (PK) | รหัส 5 หลัก เช่น `'02001'` (2 ตัวแรก = กลุ่ม) — **ห้าม reuse ตลอดกาล** (ป้าย QR จริงติดของอยู่) |
| `name` | TEXT | ไม่ | ชื่อสินค้า |
| `unit` | TEXT | ได้ | หน่วยนับ เช่น `'อัน'`, `'เมตร'` |
| `group_id` | TEXT | ไม่ (FK) | ชี้ไป `item_groups.group_id` |
| `latest_cost` | REAL | ได้ | ราคาล่าสุด — **NULL = ไม่รู้ราคา ไม่ใช่ 0 บาท** |
| `is_asset` | BOOLEAN | ไม่ (default `0`) | เป็นทรัพย์สินถาวรไหม |
| `storage_type` | TEXT | ได้ | รูปแบบจัดเก็บ |
| `vendor` | TEXT | ได้ | ร้านค้า (ข้อความลอย ๆ ยังไม่แยกตาราง) |
| `note` | TEXT | ได้ | หมายเหตุ |
| `is_active` | BOOLEAN | ไม่ (default `1`) | soft delete — เลิกใช้ตั้ง `0` ห้ามลบแถวจริง |
| `created_at` | DATETIME | ไม่ (default now) | เวลาสร้างแถว |
| `updated_at` | DATETIME | ไม่ | เวลาแก้ล่าสุด (ถ้าใช้ Prisma มันเติมให้เอง; ถ้าเขียน SQL ตรง ๆ ต้องเซ็ตเอง) |

**ตัวอย่าง:**

```sql
-- หาสินค้าตามรหัส
SELECT item_id, name, unit, latest_cost FROM items WHERE item_id = '02075';

-- ค้นสินค้าตามชื่อ (บางส่วน)
SELECT item_id, name FROM items WHERE name LIKE '%ปลั๊ก%' AND is_active = 1;

-- สินค้าในกลุ่ม '02' ที่ยังไม่รู้ราคา
SELECT item_id, name FROM items WHERE group_id = '02' AND latest_cost IS NULL;
```

---

## 5. ตาราง `stock_documents` — หัวใบรับเข้า/เบิกออก

```sql
CREATE TABLE "stock_documents" (
    "id"           INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "doc_no"       TEXT NOT NULL,
    "doc_type"     TEXT NOT NULL,
    "doc_date"     DATETIME NOT NULL,
    "status"       TEXT NOT NULL,
    "note"         TEXT,
    "requested_by" INTEGER,
    "resolved_by"  INTEGER,
    "resolved_at"  DATETIME,
    "created_by"   INTEGER,
    "created_at"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stock_documents_created_by_fkey"   FOREIGN KEY ("created_by")   REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "stock_documents_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "stock_documents_resolved_by_fkey"  FOREIGN KEY ("resolved_by")  REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "stock_documents_doc_no_key"      ON "stock_documents"("doc_no");
CREATE INDEX        "stock_documents_created_by_idx"  ON "stock_documents"("created_by");
CREATE INDEX        "stock_documents_requested_by_idx" ON "stock_documents"("requested_by");
CREATE INDEX        "stock_documents_resolved_by_idx"  ON "stock_documents"("resolved_by");
```

| คอลัมน์ | ชนิด | ว่างได้? | ความหมาย |
|---|---|---|---|
| `id` | INTEGER | ไม่ (PK, auto) | เลขใบภายใน |
| `doc_no` | TEXT | ไม่ (UNIQUE) | เลขที่ใบที่คนอ่าน เช่น `'ISS-6907-0001'` — แอปออกเลข database บังคับห้ามซ้ำ |
| `doc_type` | TEXT | ไม่ | `RECEIVE` หรือ `ISSUE` |
| `doc_date` | DATETIME | ไม่ | วันที่ทางธุรกิจของใบ |
| `status` | TEXT | ไม่ | `PENDING` / `CONFIRMED` / `CANCELLED` (RECEIVE เริ่ม CONFIRMED, ISSUE เริ่ม PENDING) |
| `note` | TEXT | ได้ | หมายเหตุ — ใช้เก็บเหตุผลตอนยกเลิกได้ |
| `requested_by` | INTEGER | ได้ (FK) | ผู้ขอเบิก (role=REQUESTER) — ISSUE บังคับมี, RECEIVE = NULL |
| `resolved_by` | INTEGER | ได้ (FK) | คนปิดคำขอ ยืนยัน/ยกเลิก (role=STAFF) — NULL ตอนยัง PENDING |
| `resolved_at` | DATETIME | ได้ | เวลาปิดคำขอ — NULL ตอนยัง PENDING |
| `created_by` | INTEGER | ได้ (FK) | คนสร้างใบ — NULL จนกว่าจะมี login |
| `created_at` | DATETIME | ไม่ (default now) | เวลาบันทึกใบเข้าระบบ |

**หมายเหตุ:** ตารางนี้มี FK ชี้ไป `users` ถึง 3 เส้น (`requested_by`, `resolved_by`, `created_by`) — เวลา JOIN ต้องระบุให้ชัดว่าใช้เส้นไหน และควรใช้ alias คนละชื่อ (ดูข้อ 7.3)

**ตัวอย่าง:**

```sql
-- สร้างใบเบิก (ISSUE) เริ่มที่ PENDING พร้อมผู้ขอ
INSERT INTO stock_documents (doc_no, doc_type, doc_date, status, requested_by, created_at)
VALUES ('ISS-6907-0001', 'ISSUE', datetime('now'), 'PENDING', 2, datetime('now'));

-- ปิดใบเป็น CONFIRMED (ตอนคนคลังยืนยัน)
UPDATE stock_documents
SET status = 'CONFIRMED', resolved_by = 1, resolved_at = datetime('now')
WHERE id = 2;
```

---

## 6. ตาราง `stock_request_items` — รายการที่ขอเบิก

```sql
CREATE TABLE "stock_request_items" (
    "id"            INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "document_id"   INTEGER NOT NULL,
    "item_id"       TEXT NOT NULL,
    "qty_requested" REAL NOT NULL,
    "qty_confirmed" REAL,
    "note"          TEXT,
    CONSTRAINT "stock_request_items_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "stock_documents" ("id")   ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "stock_request_items_item_id_fkey"     FOREIGN KEY ("item_id")     REFERENCES "items" ("item_id")        ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "stock_request_items_document_id_idx" ON "stock_request_items"("document_id");
CREATE INDEX "stock_request_items_item_id_idx"     ON "stock_request_items"("item_id");
```

| คอลัมน์ | ชนิด | ว่างได้? | ความหมาย |
|---|---|---|---|
| `id` | INTEGER | ไม่ (PK, auto) | เลขบรรทัด |
| `document_id` | INTEGER | ไม่ (FK) | อยู่ในใบ ISSUE ใบไหน (ชี้ `stock_documents.id`) |
| `item_id` | TEXT | ไม่ (FK) | ขอสินค้าตัวไหน (ชี้ `items.item_id`) |
| `qty_requested` | REAL | ไม่ | จำนวนที่ขอ — **เก็บถาวร ห้ามแก้ทับ** |
| `qty_confirmed` | REAL | ได้ | จำนวนที่ให้จริง — NULL จนกว่าจะยืนยัน (ให้ไม่ครบตามขอได้) |
| `note` | TEXT | ได้ | หมายเหตุระดับบรรทัด |

> **หัวใจของตารางนี้:** พักรายการที่ขอไว้ระหว่าง `PENDING` โดย**ไม่แตะ** `stock_transactions` (ยอดคงเหลือจึงไม่ลดจนกว่าจะยืนยัน) — เหตุผลเต็มดู [`data_dictionary.md`](data_dictionary.md) ข้อ 6.1

**ตัวอย่าง:**

```sql
-- เพิ่มรายการที่ขอ (ตอนกดขอ — qty_confirmed ยังว่าง)
INSERT INTO stock_request_items (document_id, item_id, qty_requested)
VALUES (2, '02075', 5);

-- ตอนยืนยัน กรอกจำนวนที่ให้จริง (ให้ไม่ครบก็ได้ เช่น 3 จาก 5)
UPDATE stock_request_items SET qty_confirmed = 3 WHERE document_id = 2 AND item_id = '02075';
```

---

## 7. ตาราง `stock_transactions` — สมุดบัญชีเคลื่อนไหว (หัวใจของระบบ)

```sql
CREATE TABLE "stock_transactions" (
    "id"               INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "item_id"          TEXT NOT NULL,
    "type"             TEXT NOT NULL,
    "qty_change"       REAL NOT NULL,
    "unit_cost"        REAL,
    "project"          TEXT,
    "note"             TEXT,
    "transaction_date" DATETIME NOT NULL,
    "created_at"       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "document_id"      INTEGER,
    "created_by"       INTEGER,
    CONSTRAINT "stock_transactions_item_id_fkey"     FOREIGN KEY ("item_id")     REFERENCES "items" ("item_id")          ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "stock_transactions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "stock_documents" ("id")     ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "stock_transactions_created_by_fkey"  FOREIGN KEY ("created_by")  REFERENCES "users" ("id")               ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "stock_transactions_item_id_idx"     ON "stock_transactions"("item_id");
CREATE INDEX "stock_transactions_document_id_idx" ON "stock_transactions"("document_id");
CREATE INDEX "stock_transactions_created_by_idx"  ON "stock_transactions"("created_by");
```

| คอลัมน์ | ชนิด | ว่างได้? | ความหมาย |
|---|---|---|---|
| `id` | INTEGER | ไม่ (PK, auto) | เลขลำดับแถว |
| `item_id` | TEXT | ไม่ (FK) | เป็นการเคลื่อนไหวของสินค้าตัวไหน |
| `type` | TEXT | ไม่ | `OPENING` (ยอดยกมา) / `IN` (รับเข้า) / `OUT` (เบิกออก) / `ADJUST` (ปรับยอด) |
| `qty_change` | REAL | ไม่ | **บวก = เข้า, ลบ = ออก** (ทศนิยมได้) — ยอดคงเหลือรวมจากคอลัมน์นี้ |
| `unit_cost` | REAL | ได้ | ต้นทุน/หน่วยของรายการ — NULL = ไม่รู้ |
| `project` | TEXT | ได้ | เบิกไปใช้โปรเจกต์อะไร |
| `note` | TEXT | ได้ | หมายเหตุ (64 แถวยอดยกมาติดลบมีคำเตือนตรงนี้) |
| `transaction_date` | DATETIME | ไม่ | วันที่ของเกิดจริงในโลก |
| `created_at` | DATETIME | ไม่ (default now) | เวลาบันทึกเข้าระบบ (ต่างจาก `transaction_date` ได้) |
| `document_id` | INTEGER | ได้ (FK) | ชี้ใบเอกสาร — NULL = ไม่ได้เกิดจากใบ (OPENING/ADJUST) |
| `created_by` | INTEGER | ได้ (FK) | คนทำ — NULL = ไม่รู้ (ยอดยกมา) |

### 7.1 คิดยอดคงเหลือ — คำสั่งที่ต้องจำ

```sql
-- ยอดคงเหลือของสินค้า 1 ตัว (ต้อง COALESCE เพราะสินค้าที่ไม่มีแถวเลยจะได้ NULL ไม่ใช่ 0)
SELECT COALESCE(SUM(qty_change), 0) AS balance
FROM stock_transactions
WHERE item_id = '02075';

-- ยอดคงเหลือทุกสินค้าที่เคยมีการเคลื่อนไหว
SELECT item_id, SUM(qty_change) AS balance
FROM stock_transactions
GROUP BY item_id
ORDER BY item_id;

-- ยอดรวมทั้งคลัง (ควรได้ 3016.85 ณ ส่งมอบ)
SELECT SUM(qty_change) AS ยอดรวมทั้งคลัง FROM stock_transactions;
```

### 7.2 บันทึกการเคลื่อนไหว

```sql
-- รับเข้า (IN) — qty บวก
INSERT INTO stock_transactions (item_id, type, qty_change, unit_cost, transaction_date, document_id, created_by)
VALUES ('02075', 'IN', 50, 15, datetime('now'), 1, 1);

-- เบิกออก (OUT) — qty ลบ
INSERT INTO stock_transactions (item_id, type, qty_change, transaction_date, document_id, created_by)
VALUES ('02075', 'OUT', -5, datetime('now'), 2, 1);

-- ปรับยอดหลังนับจริง (ADJUST) — ไม่มีใบ document_id = NULL
INSERT INTO stock_transactions (item_id, type, qty_change, note, transaction_date)
VALUES ('01149', 'ADJUST', 1, 'ปรับยอดจากนับจริง', datetime('now'));
```

### 7.3 ประวัติสินค้า + ใครทำ/ใบไหน (ต้องใช้ LEFT JOIN)

```sql
SELECT
  t.transaction_date, t.type, t.qty_change, t.note,
  d.doc_no,
  u.name AS ทำโดย
FROM stock_transactions t
LEFT JOIN stock_documents d ON d.id = t.document_id
LEFT JOIN users u          ON u.id = t.created_by
WHERE t.item_id = '02075'
ORDER BY t.transaction_date;
```

> ใช้ `LEFT JOIN` เพราะ `document_id`/`created_by` เป็น NULL ได้ (ยอดยกมา 579 แถวเป็น NULL ทั้งคู่) — ถ้าใช้ `JOIN` ธรรมดา แถวพวกนี้จะหายไปจากผลลัพธ์

---

## 8. Foreign key + `onDelete: RESTRICT` — ทำไม DELETE ถึง error

ทุกความสัมพันธ์ในฐานข้อมูลนี้ตั้ง `ON DELETE RESTRICT` — แปลว่า **ถ้าพยายามลบแถวที่มีตารางอื่นชี้อยู่ database จะปฏิเสธทันที** เช่น ลบ `users` ที่เคยสร้างใบ, ลบ `items` ที่มีประวัติเคลื่อนไหว → error หมด นี่คือด่านกันประวัติขาด (audit trail) โดยตั้งใจ → ให้ใช้ **soft delete** (`is_active = 0`) แทนการ `DELETE` เสมอ

**สำคัญ:** SQLite **ปิดการบังคับ foreign key เป็นค่าเริ่มต้น** ต้องเปิดเองทุก connection:

```sql
PRAGMA foreign_keys = ON;
```

ถ้าไม่เปิด จะ insert ค่า FK ที่ชี้ไปหาแถวที่ไม่มีจริงได้ (ข้อมูลพัง) — Prisma เปิดให้อัตโนมัติ แต่ถ้าเข้าผ่าน `sqlite3`/สคริปต์ตรง ๆ ต้องสั่งเอง

ตรวจว่ามี FK พังไหม:

```sql
PRAGMA foreign_key_check;      -- ไม่คืนแถวเลย = สะอาด
```

---

## 9. คำสั่งดูแลระบบที่มีประโยชน์

```sql
-- ดู CREATE TABLE จริงของทุกตาราง (ใช้ regenerate คู่มือนี้)
SELECT sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%';

-- ดูดัชนีทั้งหมด
SELECT name, tbl_name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%';

-- นับแถวทุกตารางเร็ว ๆ
SELECT 'item_groups' AS ตาราง, COUNT(*) AS n FROM item_groups
UNION ALL SELECT 'items',               COUNT(*) FROM items
UNION ALL SELECT 'stock_transactions',  COUNT(*) FROM stock_transactions
UNION ALL SELECT 'users',               COUNT(*) FROM users
UNION ALL SELECT 'stock_documents',     COUNT(*) FROM stock_documents
UNION ALL SELECT 'stock_request_items', COUNT(*) FROM stock_request_items;

-- สินค้าที่ยอดคงเหลือติดลบ (ควรมี 64 ตัว ณ ส่งมอบ)
SELECT item_id, SUM(qty_change) AS balance
FROM stock_transactions
GROUP BY item_id
HAVING SUM(qty_change) < 0
ORDER BY balance;
```

---

## ลำดับการสร้างตาราง (ถ้าต้องสร้างใหม่ด้วยมือ)

FK บังคับให้สร้างตาราง "แม่" ก่อน "ลูก" เสมอ ลำดับที่ปลอดภัย:

```
1. item_groups     (ไม่พึ่งใคร)
2. users           (ไม่พึ่งใคร)
3. items           → พึ่ง item_groups
4. stock_documents → พึ่ง users
5. stock_transactions   → พึ่ง items, stock_documents, users
6. stock_request_items  → พึ่ง stock_documents, items
```

> แต่ในทางปฏิบัติ **ไม่ต้องสร้างมือ** — ใช้ `npx prisma migrate reset` แล้วปล่อยให้ Prisma สร้างจาก migration ให้ (ดู [`handoff_guide.md`](handoff_guide.md) ข้อ 8) คู่มือนี้ไว้ "อ่านให้เข้าใจ" ไม่ใช่ไว้ copy ไปรันสร้าง database
