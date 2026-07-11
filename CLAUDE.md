# CLAUDE.md — คู่มือทำงานกับ repo นี้ (สำหรับ AI agent ทุกตัว รวมถึงตัวเองในอนาคต)

## 0. วิธีสื่อสารกับเจ้าของโปรเจกต์ — สำคัญที่สุด อ่านก่อนทำอะไรทั้งนั้น

- **คุยภาษาไทยเสมอ**
- เจ้าของโปรเจกต์เป็นนักศึกษา computer science — นี่คือโปรเจกต์เว็บจริงตัวแรก
  มีพื้นฐาน HTML/JS รู้จัก tech stack จากคอนเทนต์ในอินเทอร์เน็ต อ่านโค้ดออก เข้าใจ concept
  แต่**ยังไม่คุ้นแนวปฏิบัติมืออาชีพ** (โครงสร้างโปรเจกต์เว็บ, auth, API design, testing, deployment)
- **อธิบายละเอียด อย่ากระชับเกินไป** — เจอศัพท์หรือแนวคิดระดับมืออาชีพ ให้หยุดอธิบายว่า
  มันคืออะไร ทำงานยังไง ทำไมถึงเลือกแบบนั้น อย่าเหมาว่ารู้อยู่แล้ว
- **สอนระหว่างทำ** — เป้าหมายของเขาคือการเรียนรู้ ไม่ใช่แค่ได้โค้ดที่รันผ่าน
  อธิบายเหตุผลเบื้องหลังการตัดสินใจเสมอ ไม่ใช่แค่บอกผลลัพธ์
- **งานออกแบบหรือตัดสินใจทิศทาง ต้องหารือก่อนลงมือ** — เลือก framework/library,
  วางโครงสร้างโฟลเดอร์, ออกแบบ API, ออกแบบหน้าจอ: เสนอทางเลือกพร้อมข้อดี-ข้อเสียให้เลือกก่อน
  อย่ารีบลุยเอง (ส่วนงานลงมือที่*ตกลงกันแล้ว* ทำต่อเนื่องได้)
- เรื่อง "วันขึ้นระบบจริง / production" เจ้าของขอพักไว้ก่อน — อย่าหยิบมาพูดจนกว่าเขาจะถามเอง
  (ขั้นตอนถูกจดไว้ครบใน `DATABASE.md` แล้ว)

## 1. โปรเจกต์นี้คืออะไร + สถานะตอนนี้

ระบบจัดการคลังสินค้า: **React** (`src/`, Vite + Tailwind/DaisyUI) + **Express** (`server/`, **ESM**) + **SQLite**

**สถานะ: หลังบ้านย้ายฐานเสร็จครบทุกเส้น (products + auth + transactions + dashboard) และ
เฟส 2 backend ตาม reference ครบ 6 ฟีเจอร์แล้ว (SSE · rate limit · Viewer · คิวส่งมอบ · session เดี่ยว · Web Push)**
(9-10 ก.ค. 2026: ใช้ `server/prisma.js` เป็น client กลาง + กติกาแยกทดสอบได้ที่ `server/utils/*Rules.js`
— product/auth/transaction/sse/push · audit ฐานใหม่ที่ `server/utils/audit.js` — `actor_id` FK)
**ระบบเก่า (`server/db.js` + `identifier.sqlite`) ถูกลบทิ้งแล้ว (10 ก.ค. 2026)** — เหลือฐานเดียวคือฐานใหม่ผ่าน Prisma
ยุทธศาสตร์ที่ตกลงกัน: **controller ทำหน้าที่ "ล่าม"** — ใช้ตาราง/ตรรกะของ database ใหม่ข้างใน
แต่ตอบ JSON ทรงเดิมให้ React เพื่อให้หน้าเว็บแทบไม่ต้องแก้

| ที่ | คืออะไร |
|---|---|
| `server/prisma/` | ★ schema + migrations **ฉบับมีชีวิต** — แก้โครงสร้าง database ที่นี่ที่เดียว |
| `server/warehouse.dev.db` | ฐานพัฒนา (gitignore) — ทดลองได้เต็มที่ รีเซ็ตด้วย `scripts\db-reset-dev.ps1` |
| `Newdatabase/warehouse.db` | ต้นฉบับข้อมูลส่งมอบ (read-only + checksum) — **ห้ามแอป/Prisma ชี้ ห้ามแก้** |
| `Newdatabase/docs/` | เอกสาร database ฉบับเต็ม — `data_dictionary.md` คือเอกสารอ้างอิงหลัก |
| `Newdatabase/prisma/` | snapshot วันส่งมอบ — ห้ามแก้ (ฉบับมีชีวิตคือ `server/prisma/`) |
| `DATABASE.md` | ระเบียบการจัดการฐานข้อมูล + **การตัดสินใจทั้งหมดที่ล็อกแล้ว (ข้อ 6)** |

⚠️ **กับดักที่ห้ามเผลอ:** `server/db.js` ระบบเก่าถูกลบจาก repo แล้ว แต่**สำเนายังอยู่ใน
`wms-ics-reference/server/`** และมันรัน `CREATE TABLE IF NOT EXISTS` ตอนบูต — ห้ามรัน server ของ
reference โดยชี้ `DB_FILE` มาที่ไฟล์ warehouse ใหม่เด็ดขาด ไม่งั้นตารางเก่าจะถูกฉีดปนเข้า database ใหม่

รันโปรเจกต์: `npm run dev:all` (หน้าเว็บ 5173 + เซิร์ฟเวอร์ 5000) — ครั้งแรกต้อง
`npm install`, `npm --prefix server install`, และสร้าง `server/.env` จาก `.env.example`

## 2. repo นี้ "เป็นเจ้าของ schema" ต่อจากนี้

การแก้โครงสร้าง database ทำที่ repo นี้เท่านั้น (`server/prisma/schema.prisma` → `npx prisma migrate dev`)
**ห้ามกลับไปแก้ที่ repo ต้นทาง** (`ICS-WH_Databasetran` — โรงงานผลิต db จาก Excel ใช้ครั้งเดียวจบ)

ทำไม: (1) database ฝั่งนี้จะเริ่มสะสมข้อมูลใช้งานจริง ซึ่ง*ผลิตซ้ำจาก Excel ไม่ได้อีกแล้ว* —
repo ต้นทางสร้างได้แค่ snapshot วันส่งมอบ ถ้าเอาไฟล์จากที่นั่นมาทับ = ประวัติใช้งานจริงหายเกลี้ยง
(2) แก้ schema สองที่ = เกิดสองเวอร์ชันที่ไม่ตรงกัน (drift) ไม่รู้อันไหนคือความจริง

กติกาคู่กัน: **แก้ schema 1 ครั้ง = commit ชุดเดียว** (schema.prisma + โฟลเดอร์ migration ใหม่
+ อัปเดต `Newdatabase/docs/data_dictionary.md` ให้ตรง) — สามอย่างนี้แยกจากกันไม่ได้

## 3. Prisma 7 — กับดักที่พลาดกันบ่อย

- **ต้องส่ง driver adapter เสมอ** — ตั้งแต่ Prisma 7 สร้าง `new PrismaClient()` เปล่าๆ ไม่ได้
  (มันไม่รู้จะต่อ database ยังไง) adapter คือตัวเชื่อม Prisma ↔ ไลบรารี database จริง:
  ```js
  import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
  const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  ```
- **Prisma 7 ไม่อ่าน `.env` ให้เอง** — `server/prisma.config.ts` จึง `import "dotenv/config"` ไว้แล้ว
  และ*ตั้งใจไม่ลงทะเบียน seed* (database จริงห้ามมีปุ่ม "ล้างแล้วเติมข้อมูลตั้งต้น" ใกล้มือ)
- **Generator:** เอกสารส่งมอบแนะนำ `prisma-client` (ตัวใหม่) สำหรับโปรเจกต์ ESM แต่ตัวนั้น
  generate เป็น TypeScript ซึ่ง repo นี้เป็น **JS ล้วนไม่มี build step** — จึงคง `prisma-client-js`
  (output `server/generated/prisma`, gitignore แล้ว — สร้างใหม่ได้เสมอด้วย `npx prisma generate`)
  **พิสูจน์แล้ว (7 ก.ค. 2026):** `import { PrismaClient } from './generated/prisma/index.js'`
  จากไฟล์ ESM ใช้ได้จริง ต่อ adapter + query สำเร็จ — เกณฑ์เลือก generator ที่ถูกต้องคือ
  *"โปรเจกต์มี TypeScript build step ไหม"* ไม่ใช่ ESM/CommonJS อย่างที่ตารางในเอกสารส่งมอบเขียน
- **แก้ schema แล้วต้อง `npx prisma generate` ใหม่ + restart เซิร์ฟเวอร์เสมอ** — client คือโค้ดที่
  generate ทิ้งไว้ล่วงหน้า ไม่ได้อ่าน schema สดตอนรัน (เจอจริง 9 ก.ค. 2026: migration เพิ่ม `min_stock`
  ผ่านไปแล้ว แต่ client เก่าไม่รู้จัก field → insert พังทั้งที่ database ถูกต้อง) — และ `server/generated/`
  ถูก gitignore เครื่องที่เพิ่ง clone ก็ต้อง generate ก่อนรันครั้งแรกเช่นกัน
- ห้าม `npx prisma migrate reset` เด็ดขาด (ได้ฐานเปล่า — ฝั่งนี้ไม่มี seed กู้คืน)

## 4. กติกาที่ database บังคับไม่ได้ — โค้ดต้องคุมเองทุกครั้ง

> กติกาส่วนที่ "แก้จากเอกสารส่งมอบ" มีบันทึกตัวจริงอยู่ `DATABASE.md` ข้อ 6 —
> **ถ้าไฟล์นี้กับ DATABASE.md ขัดกันเมื่อไหร่ ให้ถือ DATABASE.md เป็นความจริง แล้วแก้ไฟล์นี้ตาม**
> (single source of truth: ความจริงต้องมีบ้านหลังเดียว ที่เหลือคือสำเนาที่ต้องเดินตาม)

SQLite ไม่มี enum จริง / บังคับเงื่อนไขแบบมีเงื่อนไขไม่ได้ กติกาพวกนี้จึงอยู่ที่วินัยของโค้ดล้วนๆ:

- **ยอดคงเหลือไม่มีคอลัมน์เก็บ** — คำนวณ `SUM(qty_change)` จาก `stock_transactions` เสมอ
  และต้อง `COALESCE(..., 0)` / `?? 0` (สินค้า 1,803 จาก 2,382 ตัวไม่มีแถวเลย — SUM ให้ NULL ไม่ใช่ 0)
  เหตุผลที่ไม่เก็บยอด: สองที่เก็บจะขัดแย้งกันเองสักวัน แล้วไม่รู้ว่าอันไหนถูก
- **`items.min_stock` NULL = ยังไม่ตั้งเกณฑ์** — ห้ามแปลงเป็นเลข default เงียบๆ ทุกชั้น
  (ฟอร์ม React เดิมมี `|| 10` ต้องถอนตอนย้ายเส้น products) ป้าย Low Stock ขึ้นเฉพาะตัวที่ตั้งเกณฑ์แล้ว
- **enum จำลอง** — โค้ดต้องกันค่านอกชุด: `type` = OPENING|IN|OUT|ADJUST ·
  `doc_type` = RECEIVE|ISSUE · `status` = PENDING|CONFIRMED|CANCELLED ·
  `role` = **Admin|Manager|Operator|Viewer** (แก้จากเอกสารเดิมที่วาง STAFF|REQUESTER ·
  Viewer ดูอย่างเดียว **มีผลแล้ว** — สมัครใหม่เริ่ม Viewer + การ์ด role ที่ server เป็นด่านหลัก
  ตาม DATABASE.md ข้อ 6.13 · fallback ของ normalizeRole = Viewer สิทธิ์ต่ำสุด)
- **ใบ ISSUE เริ่ม `PENDING` เสมอ / ใบ RECEIVE เริ่ม `CONFIRMED` เสมอ** — เบิกออกทุกใบต้องผ่าน
  การยืนยันของคนคลัง ส่วนรับเข้าคนคลังเห็นของตรงหน้า บันทึกจบในขั้นเดียว
- **ตอน PENDING ห้ามสร้างแถวใน `stock_transactions`** — พักที่ `stock_request_items` ก่อน
  เหตุผล: ยอด = SUM ทันทีที่มีแถว ถ้าเขียนตอนกดขอ ยอดจะลดทั้งที่ของยังอยู่บนชั้น
- **สิทธิ์ปิดใบ (กติกาฉบับแก้แล้ว):** Admin/Manager ยืนยัน/ปฏิเสธได้ทุกใบ ·
  ผู้ขอ (Operator) **ยกเลิกใบของตัวเองได้เฉพาะตอนยัง PENDING** — เช็ค role ในโค้ดก่อนทุกครั้ง
- **ตอนยืนยัน สร้าง transaction จาก `qty_confirmed` ไม่ใช่ `qty_requested`** — สองช่องแยกกัน
  เพื่อเก็บหลักฐานว่า "ขอเท่าไหร่" กับ "ให้จริงเท่าไหร่" ห้ามแก้ทับ `qty_requested`
- **`IN`/`OUT` ต้องมี `document_id` เสมอ / `OPENING`/`ADJUST` ต้องเป็น NULL เสมอ** —
  และ `OPENING` เป็นของ migration เท่านั้น แอปห้ามสร้างเพิ่ม
- **`created_by` ประทับจากคนที่ login แล้วเท่านั้น** — ห้ามให้ผู้ใช้เลือกชื่อจาก dropdown
  ไม่งั้น audit trail กลายเป็นสมุดเซ็นชื่อที่ปลอมได้
- **ป้ายสถานะ "ปฏิเสธ/ยกเลิก" ไม่เก็บลง database** — คำนวณตอนแสดงผล:
  `CANCELLED` + `resolved_by == requested_by` → "ยกเลิก" / ไม่เท่ากัน → "ปฏิเสธ"
  กรณีอนุมัติ 0 ทุกบรรทัด → บันทึกเป็น `CANCELLED` + note (ห้ามมีใบ CONFIRMED ที่ไร้ transaction)

## 5. กฎการทำงานกับข้อมูล — ห้ามพลาด

- **`item_id`/`group_id` เป็น text ห้าม cast เป็นตัวเลข** — เลขศูนย์นำหน้ามีความหมาย
  (`"02001"` ≠ `2001`) และป้าย QR จริงในคลังใช้ 5 ตัวท้ายเป็นคีย์ (สเปค `Newdatabase/docs/qr_spec.md`)
- **NULL แปลว่า "ไม่รู้" ไม่ใช่ 0** — `latest_cost` เป็น NULL อยู่ 745 รายการ = ไม่รู้ราคา
  ห้ามแสดงเป็น 0 บาท ห้ามเติม 0
- **ลบข้อมูล = soft delete (`is_active = false`) เท่านั้น** — FK ทุกเส้นตั้ง `ON DELETE RESTRICT`
  database จะปฏิเสธ DELETE เองอยู่แล้ว อย่าพยายามเลี่ยง
- **ห้าม reuse `item_id` ตลอดกาล** — ป้าย QR จริงติดของอยู่ในคลัง ถ้าเอารหัสเก่าไปให้ของใหม่
  สแกนแล้วชี้ผิดตัวทันที · รหัสสินค้าใหม่**ระบบออกให้ตามกลุ่ม** (5 หลัก, 2 ตัวแรก = group_id)
  ผู้ใช้พิมพ์รหัสเองไม่ได้ และห้าม auto-create สินค้าจากการสแกนที่หาไม่เจอ ·
  เลขวิ่งใหม่ = **MAX+1 ในกลุ่มเท่านั้น ห้ามถมช่องว่าง** (ช่องว่าง = รหัสที่เผาแล้ว — หลักฐาน:
  กลุ่ม 19 มีของ 116 ตัวแต่เลขวิ่งถึง 218) เพดาน 999/กลุ่ม เตือนเมื่อใกล้เต็ม — DATABASE.md ข้อ 6.9
- **`updated_at` ของ `items` ไม่มี default ใน database** — Prisma เติมให้เอง แต่ถ้าเขียน raw SQL
  ต้องเซ็ตเอง (INSERT ไม่ใส่ = พัง, UPDATE ไม่ใส่ = ค่าค้างเก่าเงียบๆ)

## 6. งานหลักที่รออยู่ (เรียงตามแผนที่ตกลงกัน)

1. ✅ **Migration auth เสร็จแล้ว** (commit `0e19dcd`) · ✅ **min_stock/image_url ลง items แล้ว**
   (migration `20260708143409` — การตัดสินใจ DATABASE.md ข้อ 6.8)
2. **ย้าย data layer ทีละเส้นทาง** (แบบล่าม รักษาทรง JSON เดิม): products → auth → transactions
   — ✅ **products ย้ายเสร็จ (9 ก.ค. 2026)**: CRUD ทั้งชุดอยู่ฐานใหม่ · ระบบออกรหัส MAX+1 ตามกลุ่ม ·
   ยอดเริ่มต้น = ใบ RECEIVE อัตโนมัติ (doc_no ตามตัวอย่างเอกสารส่งมอบ `REC-6907-0001`) ·
   bulk import พักทั้งปุ่ม+endpoint · ฟอร์ม React ถอนกับดัก `|| 10` แล้ว
   — ✅ **auth ย้ายเสร็จ (9 ก.ค. 2026)**: `users`/`password_reset_tokens`/`audit_logs` อยู่ฐานใหม่ ·
   `userManager` เป็น Prisma async (ไม่ seed ตอน import) · กติกาแยกเทสต์ที่ `utils/authRules.js`
   (login 2 แกน status=Active+is_active, โทเคนใช้ครั้งเดียว/หมดอายุ, ทรง user ต่อ endpoint) ·
   `createAdmin.js` upsert admin ฐานใหม่ (รันก่อนใช้: `npm run create-admin` ไม่งั้น `users` ว่าง → login ไม่ได้) ·
   **ลบผู้ใช้ = soft delete** (is_active=false) → username/email ถูกจองถาวร
   — ✅ **transactions ย้ายเสร็จ (9 ก.ค. 2026)**: ทั้ง 6 endpoint (request/inbound/list/history/resolve/cancel) อยู่ฐานใหม่ ·
   `utils/transactionRules.js` แปลง 3 ตาราง (StockDocument+StockRequestItem+StockTransaction) → ทรง JSON เดิม 5 สถานะ ·
   `resolveOutcome` (pure) ตัดสินอนุมัติ: อนุมัติ 0 ทุกบรรทัด → CANCELLED (ห้ามมี CONFIRMED ที่ไร้ transaction),
   ปฏิเสธ/บางส่วนต้องมีเหตุผล, อนุมัติเกินที่ขอ = reject พร้อม error (ไม่ clamp เงียบ) · ISSUE PENDING ไม่แตะสต็อก
   (พักที่ stock_request_items) → สร้าง OUT ตอน confirm จาก qty_confirmed + copy project หัวใบลงบรรทัด ·
   **ตัด auto-create สินค้าใน inbound** (SKU ไม่มี → 400) · ฟอร์มรับเข้าถอนกับดัก `|| 10` (3 จุด)
   — ✅ **dashboard ย้ายเสร็จ (10 ก.ค. 2026)**: `getDashboardStats` (ใน `productController`) เป็น Prisma ล้วน
   ทั้ง `stats`/`activities`/`stockLevels` (ตามคำขอ "ทำให้เหมือนต้นฉบับ" ไม่ตัดฟิลด์ไหนทิ้ง) ·
   `activities` reuse `mapDocumentToTransaction`/`DOCUMENT_INCLUDE` ตัวเดียวกับ `/api/transactions`
   (ย้าย `DOCUMENT_INCLUDE` ไปอยู่ `utils/transactionRules.js` ให้ 2 controller ใช้ร่วมกัน กันบั๊ก "ลืม include requestItems" ซ้ำ) ·
   `lowStockCount`/`stockLevels.minStock` **ไม่ default เป็น 10** เมื่อยังไม่ตั้งเกณฑ์ (คง NULL ตาม §6.8) —
   ต่างจาก SQL เดิมที่ปน "ของหมด" กับ "สต็อกต่ำ" เป็นตัวเลขเดียว ตอนนี้นับเฉพาะ `computeStatus()==='Low Stock'` จริง
   (เหมือนป้ายที่หน้า Products/Inventory) · ระวังการรวมยอดข้าม 2,382 สินค้าในคำเดียวด้วย `where: item_id: {in:[...]}}`
   จะชน SQLite parameter limit (P2029) — ต้องกรองผ่าน relation (`item: { is_active: true }`) แทน
   **→ `server/db.js`/`identifier.sqlite` ไม่มีใครเรียกใช้แล้วทั้ง repo (grep ยืนยัน) เหลือแค่ลบไฟล์ทิ้ง = เก็บกวาด**
   — จุดเชื่อมทุกเส้น: logAudit ฐานใหม่ (`utils/audit.js`, actor_id FK) + ประทับ `created_by`/`resolved_by` = `req.user.id`
   — ทุกเส้นทางที่ย้ายเสร็จ **เขียนเทสต์แบบเบาคู่กันด้วย `node --test`** เฉพาะกติกาที่ database
   บังคับไม่ได้ (ยอดคงเหลือ, สิทธิ์ปิดใบ, การแปลงสถานะของล่าม) — การตัดสินใจ 7 ก.ค. 2026:
   เอา testing "แบบเบา" ไม่ต้องครอบทุก endpoint
   (products: `server/test/productRules.test.js` · auth: `server/test/authRules.test.js` ·
   transactions: `server/test/transactionRules.test.js` — ปัจจุบันรวมเทสต์เฟส 2 + labels
   หน้าบ้านแล้ว `npm test` ผ่าน 83 ตัว)
3. ✅ **เก็บกวาดฐานเก่าเสร็จ (10 ก.ค. 2026):** ลบ `server/db.js` + `identifier.sqlite`(+wal/shm) แล้ว
   (`data/users.json` ไม่มีอยู่จริง ไม่ต้องลบ) + อัปเดต .gitignore/เอกสารครบ
4. **ฟีเจอร์ตามพันธะของข้อมูล:** หน้าจอคิวรออนุมัติของคนคลัง · ฟีเจอร์ปรับยอด (ADJUST) +
   ป้ายเตือนสินค้า 64 ตัวที่ยอดติดลบ (ห้ามเดาตัวเลข ต้องนับของจริง) · แสดง "ไม่รู้ราคา" แทน 0 บาท ·
   ระบบออกรหัสสินค้าตามกลุ่ม · สแกน/พิมพ์ QR (parser + edge cases อยู่ `qr_spec.md` ข้อ 5–6)
5. **แผนอัปเดตตามเวอร์ชัน `wms-ics-reference/` (ตกลงกัน 10 ก.ค. 2026)** — โฟลเดอร์นี้คือแอปเวอร์ชันที่
   เจ้าของพัฒนาฟีเจอร์ต่อไปไกลกว่า repo นี้ แต่สร้าง*บนสถาปัตยกรรมเก่า* (better-sqlite3 + `db.js` +
   `identifier.sqlite`) → ใช้เป็น **สเปคอ้างอิงเท่านั้น ห้าม copy `server/` มาทับเด็ดขาด**
   (จะล้มการย้ายฐานข้อมูลทั้งหมด) วิธีที่ถูกคือทำฟีเจอร์เดียวกันบนฐานใหม่แบบล่าม โดยอ่าน controller
   ของ reference เป็นสเปคว่า JSON ต้องทรงไหน · ข้อมูลใน reference เป็น**ข้อมูลทดลองล้วน ไม่ต้องย้าย** ·
   ⚠️ ข้างในมี secrets จริง (`wms-ics-reference/server/.env`: JWT/EMAIL/VAPID) + node_modules + ไฟล์ db —
   **ห้ามหลุดเข้า git** (เฟส 0 ใส่ `.gitignore`)
   **การตัดสินใจที่เคาะแล้ว: เอาครบทั้ง 4 เรื่องที่แตะกติกา/สคีมา** — role `Viewer` (+สมัครใหม่เริ่ม
   Viewer แทน Operator) · คิวรอส่งมอบ (คอลัมน์ `picked_up_at` บน `stock_documents`) ·
   1 บัญชี = 1 อุปกรณ์ (คอลัมน์ `session_id` บน `users`) · Web Push (ตารางใหม่ `push_subscriptions`
   **ผูก user id เป็น FK ตามธรรมเนียมฐานใหม่ ไม่ใช่ username แบบ reference**) —
   ทั้ง 4 ต้องบันทึกลง `DATABASE.md` ข้อ 6 ตอนทำเฟส 1 ก่อนแตะโค้ด
   ลำดับเฟส (ธรรมเนียมเดิม: 1 ชิ้นงาน = จบเป็น commit + เทสต์เบา · จบเฟสแล้ว**ติ๊ก ✅ ที่นี่**
   ให้เซสชันถัดไปรู้ว่าอยู่ตรงไหน):
   - [x] ✅ **เฟส 0 เก็บกวาด+กันพลาด (เสร็จ 10 ก.ค. 2026):** `.gitignore` โฟลเดอร์ `wms-ics-reference/` +
     ลบ `server/db.js`/`identifier.sqlite`(+wal/shm) (= งานข้อ 3 ข้างบนพอดี) + อัปเดตเอกสาร
   - [x] ✅ **เฟส 1 บันทึกการตัดสินใจ 4 เรื่องลง `DATABASE.md` ข้อ 6 (เสร็จ 10 ก.ค. 2026)** —
     ข้อ 6.13–6.16: Viewer role (server เป็นด่านหลัก UI เป็นด่านเสริม) · คิวรอส่งมอบ
     `picked_up_at` (สิทธิ์กด = Admin/Manager เท่านั้น + backfill ใบเก่า) · session เดี่ยว
     `session_id` (หลัง deploy ทุกคน login ใหม่ 1 ครั้ง) · Web Push `push_subscriptions`
     ผูก `user_id` FK (ข้อยกเว้น soft delete ตั้งใจ: endpoint ตาย 410/404 ลบทิ้งจริง)
   - [x] ✅ **เฟส 2 backend บนฐานใหม่ ทีละฟีเจอร์ — เสร็จครบ 6 ฟีเจอร์ (10 ก.ค. 2026)** (1 ฟีเจอร์ = 1 commit + เทสต์เบา · migration ใครมัน
     แยก commit ชุดของใครมัน (schema+migration+data_dictionary) ตามข้อ 2 · ตกลง 10 ก.ค. 2026:
     แบ่งทำ ~3 เซสชันเรียงต่อกัน — A=สามข้อแรกไม่แตะ schema · B=สอง migration เล็ก · C=Web Push):
     - [x] ✅ **SSE `/api/events`** — `server/events.js` + กติกา/เทสต์ `utils/sseRules.js` · token ผ่าน
       query string (EventSource ใส่ Authorization header ไม่ได้ — ยอมรับได้เพราะช่องนี้ส่งสัญญาณเปล่า)
       แต่ด่านตรวจตอนต่อเข้มเท่า `verifyAuth` (เช็ค canLogin ไม่ใช่แค่ลายเซ็น token) · `broadcast()`
       หลังเขียนฐานสำเร็จเท่านั้น ทุก controller (รวมจุดที่ reference ไม่ยิง: `updateUserRole`)
     - [x] ✅ **rate limit** — ตัวเลขตาม reference เป๊ะ: login/reset นับเฉพาะครั้งพลาด 15/15นาที
       (ทั้งออฟฟิศออก IP เดียวกัน (NAT) คนล็อกอินถูกไม่โดนลูกหลง) · forgot 6/ชม. · register 10/ชม. ·
       จงใจไม่ใส่ `trust proxy` ของ reference (ผูกกับเรื่อง deploy ที่พักไว้ตามข้อ 0)
     - [x] ✅ **role Viewer** — VALID_ROLES + fallback ของ `normalizeRole` เปลี่ยนเป็น Viewer
       (least privilege — เคาะ 10 ก.ค. 2026) · สมัครใหม่ role=Viewer · เพิ่มการ์ด role ที่
       `POST /transactions/request` + `PUT /transactions/:id/cancel` (products/users การ์ดครบอยู่แล้ว)
     - [x] ✅ **คิวรอส่งมอบ** — migration `20260710131952` + backfill `COALESCE(resolved_at, doc_date)`
       (แก้ข้อความ DATABASE.md ข้อ 6.14 ที่เขียน `updated_at` ผิดแล้ว) · endpoint
       `PUT /transactions/:id/pickup` (Admin/Manager · updateMany เงื่อนไข NULL กันกดพร้อมกัน) ·
       `pickedUpAt` เพิ่มในทรง JSON ของล่าม · เงื่อนไขกด = `canMarkPickedUp` (pure + เทสต์)
     - [x] ✅ **session เดี่ยว** — migration `20260710132934` + claim `sid` ใน token · เข้มกว่า reference
       ตามข้อ 6.15: token ไม่มี `sid` = ตายทันที (reference ยอมให้ผ่านตอน session_id ยัง NULL) ·
       กติกา = `authRules.checkSession` (pure + เทสต์) ด่านครอบทั้ง verifyAuth และ SSE ·
       updateProfile ออก token ใหม่พก `sid` เดิมแล้ว · sid ไม่ตรง → 401 `code: SESSION_REPLACED`
     - [x] ✅ **Web Push** — migration `20260710193403` ตาราง `push_subscriptions` (`user_id` FK
       ตามข้อ 6.16 · endpoint ตาย 410/404 ลบจริง = ข้อยกเว้น soft delete ที่ตั้งใจ) · `push.js`
       ฉบับ Prisma + `routes/pushRoutes.js` · กติกาแยกเทสต์ `utils/pushRules.js` (ป้ายผลจากตัวเลขจริง
       + เกณฑ์อุปกรณ์ตาย) · VAPID สร้างชุดใหม่ลง `.env` แล้ว + `.env.example` มีช่องครบ · push จุดเดียว
       ตอน resolve แจ้งผลผู้ขอ แบบไม่ await (ช้า/ล่มไม่กระทบ response) — ใบใหม่เข้าใช้กระดิ่ง SSE พอ
       · ⚠️ เจอกับดักข้อ 3 ซ้ำ: `migrate dev` รอบนี้ไม่ generate client ให้ ต้อง `npx prisma generate` เอง
   - [ ] **เฟส 3 ยกหน้าบ้านทั้งชุด** — ตกลง 11 ก.ค. 2026: หน้าบ้าน**ใช้วิธี copy จาก reference แล้ว
     audit ทีละไฟล์** (ต่างจาก `server/` ที่ห้าม copy — หน้าบ้านผูกแค่ทรง JSON ซึ่งล่ามคงไว้แล้ว ·
     จุดเชื่อมตรวจแล้วตรงกันหมด: ชื่อ event SSE ทั้ง 3 · payload `{subscription}`+public-key ของ push ·
     endpoint pickup+`pickedUpAt` · code `SESSION_REPLACED`) · ขนาดงานจริง: 23 ไฟล์ +1,563/−424 บรรทัด ·
     เทสต์หน้าบ้าน (เคาะ 11 ก.ค. 2026): **ไม่เพิ่ม framework ใหม่** — ตรวจของจริงใน browser ทุกก้อนก่อน
     commit + `node --test` เฉพาะ util ที่เป็น JS ล้วน · แบ่ง 3 เซสชันเรียงต่อกัน (จบเซสชันติ๊ก ✅ ที่นี่):
     - [x] ✅ **3A ฐานร่วม+real-time (เสร็จ 11 ก.ค. 2026, 5 commits):** deps (เพิ่ม `html5-qrcode`,
       `jspdf-autotable` · ถอน `html-to-image` ที่ grep แล้วไม่มีใครใช้) · utils ทั้งชุด (api ดัก
       SESSION_REPLACED / events / push / labels / confirm / device / thaiFont) + เทสต์เบา
       `src/utils/labels.test.js` · index.css · App + Navbar (กระดิ่ง SSE — พิสูจน์จริง broadcast→browser
       ~30ms) + Login + ResetPassword · Skeleton + WelcomeTips · vite.config `host:true` + `src/.env`
       (เปิดจากมือถือวง LAN — ดู layout ได้ แต่กล้อง/SW/push ต้องการ secure context จึงทดสอบเต็มที่ได้
       เฉพาะ localhost บนคอม) — **ข้อค้นพบส่งต่อ 3B:**
       (1) ⚠️ **Navbar ส่ง `?view=active`/`?since=` แต่ `getTransactions` ล่ามฝั่งเรายังไม่รองรับ query**
       — คืนทั้งหมดเสมอ client กรองเองจึงถูกต้องแค่เปลือง bandwidth · Homepage ใหม่ใช้ `?view=dashboard`
       เหมือนกัน → 3B ควรเพิ่ม query support ที่ล่าม (สเปคอยู่ reference `getFullTransactions`) เป็น commit แยก
       (2) **แก้ค่า `@plugin "daisyui/theme"` ใน index.css แล้ว HMR ไม่พอ ต้อง restart Vite** (plugin อ่าน
       config แค่ตอนบูต — เจอจริง: ธีมไม่เปลี่ยนทั้งที่ log ขึ้น hmr update)
       (3) `src/.env` โดน `.gitignore` (`**/.env`) จึงใช้ `src/.env.example` เข้า git ตามธรรมเนียม server/
       — อนึ่ง Vite ไม่อ่าน env จาก `src/` อยู่แล้ว (อ่านจาก root เท่านั้น) ไฟล์นี้เป็นเอกสารบอกช่องคอนฟิก
       (4) ทิป Admin ใน WelcomeTips ตัดคำว่านำเข้า CSV ออกแล้ว (ของเรา bulk import พักอยู่) —
       3B ตอน copy หน้า Products อย่าลืมว่าปุ่ม import ต้องพักต่อ
     - [ ] **3B หน้าหลัก 4 หน้า+สแกนเนอร์:** BarcodeScanner + Products + Inventory + Homepage
       (คิวรอส่งมอบ + PDF ไทยผ่าน thaiFont) + UserManagement · ⚠️ ถอนกับดัก `|| 10` ฟอร์ม inbound
       (Products บรรทัด ~120, ~175) · **ฟอร์ม inbound เปลี่ยนเป็นเลือกจากสินค้าที่มีอยู่เท่านั้น**
       (เคาะ 11 ก.ค. 2026 — reference ให้พิมพ์ SKU+ชื่อใหม่อิสระเพราะ backend เก่า auto-create ได้
       ของเรา 400) · สแกนได้โค้ดแล้ว**ใส่ช่องค้นหาเท่านั้น** ห้าม auto-create (parser ป้าย QR จริงตาม
       `qr_spec.md` เป็นงานข้อ 4 แยกต่างหาก ไม่รวมในเฟสนี้)
     - [ ] **3C ชุด PWA+Push:** public/ (manifest / sw.js / icons) + index.html (meta PWA) + main.jsx
       (ลงทะเบียน SW) + InstallPrompt + Settings (ปุ่มเปิดแจ้งเตือน — ต้องกดจากปุ่มโดยตรง เงื่อนไข iOS)
   - [ ] **เฟส 4 ตรวจรวม:** `npm test` + `dev:all` ไล่คลิกทุกหน้า + ทดสอบ SSE/push จริงใน browser
   (ส่วน "เสิร์ฟ dist/ จาก Express + tunnel" ที่ reference มี = เรื่อง deploy → พักไว้ตามข้อ 0)

## 7. ระเบียบ database ประจำวัน (ฉบับย่อ — ตัวเต็ม `DATABASE.md`)

- อยากได้ฐานสะอาด: `.\scripts\db-reset-dev.ps1` (copy ต้นฉบับทับ + migrate deploy)
- ก่อน `migrate dev` ทุกครั้ง: `.\scripts\db-backup.ps1` แล้ว**เปิดอ่านไฟล์ SQL ที่ generate ก่อน apply**
  (Prisma มอง rename เป็น DROP+ADD — ข้อมูลคอลัมน์นั้นหายถ้าไม่จับ)
- ตรวจฐานเทียบสภาพส่งมอบ: `node server/accept.js`
- สคริปต์ `.ps1` ในโปรเจกต์นี้ต้องเป็น UTF-8 **มี BOM** (มีภาษาไทย — PowerShell 5.1 อ่านผิดถ้าไม่มี)

## 8. ธรรมเนียม git ของ repo นี้

- ข้อความ commit **ภาษาไทยหรืออังกฤษก็ได้** — สิ่งที่ขาดไม่ได้คือบอก "ทำไม" ไม่ใช่แค่ "ทำอะไร"
- แก้ schema 1 ครั้ง = 1 commit ชุดเดียว: `schema.prisma` + โฟลเดอร์ migration ใหม่ +
  `data_dictionary.md` ที่อัปเดตแล้ว — สามอย่างนี้ห้ามแยก commit (แยกแล้วเครื่องอื่น migrate ไม่ได้/เอกสารโกหก)
- ไฟล์ที่ห้ามหลุดเข้า git: `server/warehouse.dev.db`, `backups/`, `server/generated/`, `.env`
  (`.gitignore` กันไว้แล้ว — ห้ามใช้ `git add -f` ฝืน)
