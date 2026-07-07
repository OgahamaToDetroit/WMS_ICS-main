# คู่มือฐานข้อมูล + ตัวอย่างการใช้งานจริง (สำหรับคนรู้ SQL)

> **เอกสารนี้เขียนให้ใคร:** คนที่รู้ SQL พื้นฐาน (SELECT/INSERT/UPDATE/JOIN) แต่ไม่ใช่คนทำโปรเจกต์นี้ — เช่น นักวิเคราะห์ข้อมูล, คนทำรายงาน, หรือคนที่จะมาต่อยอดแอปแล้วอยากเข้าใจภาพก่อนเปิดโค้ด **ไม่ต้องรู้ Prisma หรือ JavaScript มาก่อนก็อ่านได้**
>
> อยากได้รายละเอียดทุกคอลัมน์แบบละเอียดยิบ (ชนิดข้อมูล SQLite จริง, กติกาทุกข้อ) ไปอ่าน [`data_dictionary.md`](data_dictionary.md) — ไฟล์นี้เน้น "ภาพรวม + ตัวอย่างใช้งานจริงเป็นเรื่องราว" แทน

---

## 0. เปิดดูข้อมูลจริงยังไง

ไฟล์ฐานข้อมูลคือ `warehouse.db` (SQLite) อยู่ที่ root ของ repo เปิดดูได้หลายทาง:

- **`sqlite3` command line:** `sqlite3 warehouse.db` แล้วพิมพ์ SQL ได้เลย
- **DB Browser for SQLite** — โปรแกรม GUI ฟรี ลากไฟล์ `warehouse.db` เข้าไปดู/รัน query ได้
- **Prisma Studio** (ถ้ามี Node.js): `npx prisma studio` — เปิดเป็นหน้าเว็บ local ดูข้อมูลแบบตาราง

ตัวอย่าง SQL ทั้งหมดในเอกสารนี้เป็น SQLite ธรรมดา รันกับ `warehouse.db` ได้ตรง ๆ ไม่ต้องผ่าน Prisma

---

## 1. ภาพรวม 6 ตาราง

| ตาราง | เก็บอะไร | ข้อมูลตอนนี้ |
|---|---|---|
| `item_groups` | กลุ่มสินค้า (รหัส 2 หลัก) | 23 แถว มีข้อมูลจริง |
| `items` | ทะเบียนสินค้าทั้งหมด (master) | 2,382 แถว มีข้อมูลจริง |
| `stock_transactions` | สมุดบัญชี — 1 แถว = 1 การเคลื่อนไหวสต็อกที่ **เกิดขึ้นจริงแล้ว** | 579 แถว มีข้อมูลจริง (ยอดยกมา) |
| `users` | คนที่เกี่ยวข้องกับคลัง แยกด้วย `role`: `STAFF` (คนคลัง) / `REQUESTER` (ผู้ขอเบิก) | ว่าง — รอแอปเติม |
| `stock_documents` | หัวใบรับเข้า/เบิกออก 1 ใบ | ว่าง — รอแอปเติม |
| `stock_request_items` | รายการที่ "ขอ" เบิก ระหว่างรออนุมัติ | ว่าง — รอแอปเติม |

ความสัมพันธ์แบบย่อ:

```
item_groups ──< items ──< stock_transactions >── stock_documents ──< stock_request_items >── items
                                                        │
                                                        └── requested_by / resolved_by / created_by ──> users
```

**หัวใจของระบบคือ `stock_transactions`** — ตารางเดียวที่บอกว่า "ของเข้า/ออกจริง" ยอดคงเหลือของสินค้าคำนวณจากตารางนี้ล้วน ๆ (ดูข้อ 2) ตารางอื่นเป็นแค่ "บริบท" ที่ห้อมล้อมมันอยู่

---

## 2. กติกาที่ต้องรู้ก่อนเขียน SQL เอง

รู้ 4 ข้อนี้ก่อน ไม่งั้น query จะได้ผลลัพธ์ผิดโดยไม่รู้ตัว:

1. **`item_id` / `group_id` เป็น TEXT เสมอ** — ห้าม `CAST` เป็นตัวเลขหรือเอาไปคำนวณ เพราะเลขศูนย์นำหน้ามีความหมาย (`"02001"` ≠ `2001`)
2. **ยอดคงเหลือไม่มีคอลัมน์เก็บ** — ต้องคำนวณเองทุกครั้งด้วย `SUM(qty_change)` จาก `stock_transactions` (ตัวอย่างเต็มในข้อ 4)
3. **NULL มีความหมาย ไม่ใช่ "ไม่มีค่า" เฉย ๆ** — เช่น `document_id IS NULL` แปลว่า "รายการนี้ไม่ได้เกิดจากใบเอกสาร" (ยอดยกมา/ปรับยอด), `latest_cost IS NULL` แปลว่า "ไม่รู้ราคา" ไม่ใช่ราคา 0 บาท
4. **คอลัมน์ที่ดูเหมือน enum (`type`, `status`, `role`, `doc_type`) เป็น TEXT ธรรมดา** — SQLite ไม่มี enum จริง database ไม่ช่วยกันพิมพ์ผิด ต้องรู้ค่าที่ถูกต้องเอง:
   - `stock_transactions.type` → `OPENING` \| `IN` \| `OUT` \| `ADJUST`
   - `stock_documents.doc_type` → `RECEIVE` \| `ISSUE`
   - `stock_documents.status` → `PENDING` \| `CONFIRMED` \| `CANCELLED`
   - `users.role` → `STAFF` \| `REQUESTER`

---

## 3. ตัวอย่างที่ใช้ตลอดเอกสารนี้

ใช้สินค้าจริงตัวหนึ่งในฐานข้อมูลเป็นตัวอย่าง เพื่อให้ query อ่านแล้วรันได้จริง (แต่ `users`/`stock_documents` ยังว่าง ต้อง insert คนก่อนถึงจะรันตัวอย่าง insert ได้ครบ):

| ตัวละคร/ของ | ค่า |
|---|---|
| สินค้า | `item_id = '02075'` ชื่อ "ปลั๊ก XT30G" หน่วย "คู่" ยอดคงเหลือปัจจุบัน 25 คู่ |
| คนคลัง | สมหญิง — จะ insert เป็น `users` แถวแรก `role='STAFF'` |
| ผู้ขอเบิก | สมชาย — จะ insert เป็น `users` แถวที่สอง `role='REQUESTER'` |

```sql
INSERT INTO users (name, role) VALUES ('สมหญิง (คนคลัง)', 'STAFF');       -- ได้ id = 1
INSERT INTO users (name, role) VALUES ('สมชาย (ช่าง)', 'REQUESTER');      -- ได้ id = 2
```

---

## 4. เช็คยอดคงเหลือ + ดูประวัติสินค้า (ใช้กับข้อมูลจริงที่มีอยู่แล้วได้เลย)

**ยอดคงเหลือของสินค้าหนึ่งตัว:**

```sql
SELECT COALESCE(SUM(qty_change), 0) AS balance
FROM stock_transactions
WHERE item_id = '02075';
```

ต้อง `COALESCE(..., 0)` เสมอ เพราะสินค้าที่ไม่เคยมีการเคลื่อนไหวเลย (ไม่มีแถวใน `stock_transactions`) จะได้ `SUM()` เป็น `NULL` ไม่ใช่ `0` — ในฐานข้อมูลนี้มีสินค้าแบบนี้อยู่ถึง 1,803 ตัว จาก 2,382 ตัว

**ประวัติความเคลื่อนไหวของสินค้าหนึ่งตัว พร้อมชื่อคนทำ/เลขที่ใบ (ถ้ามี):**

```sql
SELECT
  t.transaction_date,
  t.type,
  t.qty_change,
  t.note,
  d.doc_no,
  u.name AS ทำโดย
FROM stock_transactions t
LEFT JOIN stock_documents d ON d.id = t.document_id
LEFT JOIN users u ON u.id = t.created_by
WHERE t.item_id = '02075'
ORDER BY t.transaction_date;
```

ใช้ `LEFT JOIN` เพราะ `document_id`/`created_by` เป็น NULL ได้ (ยอดยกมาทั้ง 579 แถวตอนนี้เป็น NULL ทั้งคู่ — ถ้าใช้ `JOIN` ธรรมดาแถวพวกนี้จะหายไปจากผลลัพธ์ทั้งที่ควรเห็น)

---

## 5. เคสรับเข้า (RECEIVE) — คนคลังทำเองตรง ๆ

ร้านค้าส่งปลั๊ก XT30G มาเพิ่ม 50 คู่ ราคาซื้อ 15 บาท/คู่ สมหญิง (คนคลัง, id=1) เป็นคนบันทึกรับเข้า — ฝั่งนี้ **ไม่ผ่านการอนุมัติ** สร้างใบแล้วเสร็จในขั้นตอนเดียว:

```sql
-- 1) สร้างหัวใบ — status เริ่มที่ CONFIRMED ทันที (ไม่มี PENDING สำหรับ RECEIVE)
INSERT INTO stock_documents (doc_no, doc_type, doc_date, status, created_by, created_at)
VALUES ('REC-6907-0001', 'RECEIVE', datetime('now'), 'CONFIRMED', 1, datetime('now'));
-- สมมติได้ id = 1

-- 2) สร้างรายการเคลื่อนไหวจริงทันที (type=IN, qty_change เป็นบวก)
INSERT INTO stock_transactions
  (item_id, type, qty_change, unit_cost, transaction_date, document_id, created_by)
VALUES
  ('02075', 'IN', 50, 15, datetime('now'), 1, 1);
```

เช็คยอดหลังรับเข้า (ควรได้ 25 + 50 = 75):

```sql
SELECT COALESCE(SUM(qty_change), 0) FROM stock_transactions WHERE item_id = '02075';
```

---

## 6. เคสเบิกออก (ISSUE) — ต้องผ่านขอ→อนุมัติเสมอ

นี่คือจุดที่ต่างจาก RECEIVE ชัดเจนที่สุด: **ไม่ว่าจะขอผ่านเว็บล่วงหน้า หรือเดินมาขอที่ห้องสด ก็ต้อง "ขอผ่านแอป" ก่อนเสมอ** แล้วให้คนคลัง (`role='STAFF'`) เป็นคนกดยืนยันถึงจะตัดสต็อกจริง มี 3 ขั้นตอน:

### ขั้น 1 — สมชายกด "ขอเบิก" 5 คู่ (สร้าง `PENDING`)

**สำคัญที่สุด: ขั้นนี้ห้ามแตะ `stock_transactions` เด็ดขาด** ถ้าสร้างแถวตอนนี้ ยอดคงเหลือจะลดทันทีทั้งที่ของยังไม่ได้ออกจากชั้นจริง — พักคำขอไว้ที่ `stock_request_items` ก่อน:

```sql
-- 1) สร้างหัวใบ ISSUE เริ่มที่ PENDING เสมอ — requested_by บังคับมี
INSERT INTO stock_documents (doc_no, doc_type, doc_date, status, requested_by, created_at)
VALUES ('ISS-6907-0001', 'ISSUE', datetime('now'), 'PENDING', 2, datetime('now'));
-- สมมติได้ id = 2

-- 2) พักรายการที่ขอไว้ — qty_confirmed ยังไม่กรอก (NULL)
INSERT INTO stock_request_items (document_id, item_id, qty_requested)
VALUES (2, '02075', 5);
```

ลองเช็คยอดตอนนี้ — **ต้องยังเป็น 75 เท่าเดิม** (ไม่ลดเลยทั้งที่มีคนขอไปแล้ว):

```sql
SELECT COALESCE(SUM(qty_change), 0) FROM stock_transactions WHERE item_id = '02075';
```

### ขั้น 2ก — สมหญิงกด "ยืนยัน" (ให้ครบตามขอ)

ตอนนี้เท่านั้นที่ของออกจากชั้นจริง จึงสร้างแถวใน `stock_transactions`:

```sql
-- 1) กรอกจำนวนที่ให้จริง (ให้ครบ 5 ตามขอ)
UPDATE stock_request_items SET qty_confirmed = 5 WHERE document_id = 2 AND item_id = '02075';

-- 2) สร้างรายการเคลื่อนไหวจริง — ลบ เพราะของออก, ใช้ qty_confirmed ไม่ใช่ qty_requested
INSERT INTO stock_transactions
  (item_id, type, qty_change, transaction_date, document_id, created_by)
VALUES
  ('02075', 'OUT', -5, datetime('now'), 2, 1);   -- created_by = 1 คือสมหญิง (คนกดยืนยัน)

-- 3) ปิดคำขอ
UPDATE stock_documents
SET status = 'CONFIRMED', resolved_by = 1, resolved_at = datetime('now')
WHERE id = 2;
```

สังเกต: `created_by` ของ `stock_transactions` คือ **สมหญิง** (คนกดยืนยัน) ไม่ใช่สมชาย (คนขอ) — ถ้าอยากรู้ว่า "ใครเป็นคนขอ" ต้อง join ย้อนไปที่ `stock_documents.requested_by` (ดูตัวอย่างข้อ 7)

### ขั้น 2ข — หรือถ้าของไม่พอ สมหญิงกด "ยกเลิก" แทน

```sql
UPDATE stock_documents
SET status = 'CANCELLED', resolved_by = 1, resolved_at = datetime('now'), note = 'ของหมดสต็อก'
WHERE id = 2;
```

**ไม่มีการ insert ใน `stock_transactions` เลย** — ยอดคงเหลือไม่กระทบแม้แต่นิดเดียว (นี่คือทั้งหมดที่เกิดขึ้นเมื่อยกเลิก)

### กรณีให้ไม่ครบตามที่ขอ

ถ้าสมชายขอ 10 แต่ของเหลือแค่ 7 คู่ — `qty_confirmed` ใส่ 7 ได้เลย (ต่างจาก `qty_requested` ที่ยังคงเป็น 10 ตลอดไป เก็บไว้เป็นหลักฐานว่าตอนแรกขอเท่าไหร่):

```sql
UPDATE stock_request_items SET qty_confirmed = 7 WHERE document_id = 2 AND item_id = '02075';
INSERT INTO stock_transactions (item_id, type, qty_change, transaction_date, document_id, created_by)
VALUES ('02075', 'OUT', -7, datetime('now'), 2, 1);   -- ใช้ -7 ไม่ใช่ -10
```

---

## 7. Query ที่มีประโยชน์อื่น ๆ

**คิวคำขอที่รออนุมัติ (สำหรับหน้าจอคนคลัง):**

```sql
SELECT
  d.id, d.doc_no, d.doc_date,
  ur.name AS ผู้ขอ,
  ri.item_id, i.name AS ชื่อสินค้า, ri.qty_requested
FROM stock_documents d
JOIN stock_request_items ri ON ri.document_id = d.id
JOIN items i ON i.item_id = ri.item_id
JOIN users ur ON ur.id = d.requested_by
WHERE d.status = 'PENDING'
ORDER BY d.doc_date;
```

**ใครขอ ใครอนุมัติ ให้จริงกี่ชิ้น (audit trail เต็ม ๆ ของใบที่ปิดแล้ว):**

```sql
SELECT
  d.doc_no, d.status,
  ur.name AS ผู้ขอ,
  us.name AS ผู้อนุมัติ,
  d.resolved_at,
  ri.item_id, ri.qty_requested, ri.qty_confirmed
FROM stock_documents d
JOIN stock_request_items ri ON ri.document_id = d.id
LEFT JOIN users ur ON ur.id = d.requested_by
LEFT JOIN users us ON us.id = d.resolved_by
WHERE d.doc_type = 'ISSUE'
ORDER BY d.resolved_at DESC;
```

**สินค้าที่ยอดคงเหลือติดลบ (ต้องแก้ด้วยฟีเจอร์ปรับยอดหลังนับของจริง ห้ามเดา):**

```sql
SELECT item_id, SUM(qty_change) AS balance
FROM stock_transactions
GROUP BY item_id
HAVING SUM(qty_change) < 0;
```

---

## 8. สรุปกติกาที่แอปต้องคุมเอง (database บังคับให้ไม่ได้)

ทั้งหมดนี้ **SQL ที่เขียนตรง ๆ ไม่มีอะไรกันไว้เลย** ต้องอาศัยวินัยของโค้ดฝั่งแอป (รายละเอียดเต็มอยู่ [`handoff_guide.md`](handoff_guide.md) ข้อ 7):

- ใบ `ISSUE` ต้องเริ่ม `PENDING` เสมอ, ใบ `RECEIVE` ต้องเริ่ม `CONFIRMED` เสมอ
- เฉพาะคนที่ `role='STAFF'` เท่านั้นกดยืนยัน/ยกเลิกได้ — ต้องเช็คก่อนทุกครั้งในโค้ด ไม่ใช่ปล่อยให้ SQL ทำแทน
- ตอน `PENDING` ห้ามมีแถวใน `stock_transactions` ของใบนั้นเด็ดขาด
- ตอนยืนยัน ต้องใช้ `qty_confirmed` สร้าง transaction ไม่ใช่ `qty_requested`
- ค่าคอลัมน์แบบ enum จำลอง (`type`, `status`, `role`, `doc_type`) ต้องคุมให้อยู่ในชุดที่กำหนดเท่านั้น

อยากเข้าใจ "ทำไมต้องออกแบบแบบนี้" ลึกกว่านี้ (เหตุผลเบื้องหลังแต่ละกติกา) อ่านต่อได้ที่ [`data_dictionary.md`](data_dictionary.md) ข้อ 6.1
