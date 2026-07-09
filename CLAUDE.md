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

**สถานะ: กำลังย้ายหลังบ้านจาก schema เดิมไปใช้ database ที่รับมอบมา — products + auth + transactions ย้ายแล้ว**
(9 ก.ค. 2026: ใช้ `server/prisma.js` เป็น client กลาง + กติกาแยกทดสอบได้ที่ `server/utils/productRules.js`,
`server/utils/authRules.js`, `server/utils/transactionRules.js` · audit ฐานใหม่ที่ `server/utils/audit.js` — `actor_id` FK)
เส้น transactions ทั้ง 6 endpoint อยู่ฐานใหม่แล้ว (`transactionController` เป็น prisma ล้วน ไม่แตะ `db.js`) —
**เหลือเฉพาะ `getDashboardStats` (ใน `productController`) ที่ยังอ่าน `identifier.sqlite`** จึงยังต้องคง `server/db.js` ไว้
⚠️ ช่วงเปลี่ยนผ่าน: การ์ดสถิติ 4 ใบบนหน้า Homepage (มาจาก `getDashboardStats` ฐานเก่า ที่ไม่มีคนเขียนแล้ว)
จะค้าง/เป็นศูนย์ ส่วนคิว/ประวัติด้านล่าง (มาจาก `/transactions` ฐานใหม่) ถูกต้อง — จอเดียวเลขไม่ตรงกันชั่วคราว ตั้งใจ (Part 3 แก้)
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

⚠️ **กับดักที่ห้ามเผลอ:** `server/db.js` (ระบบเก่า) รัน `CREATE TABLE IF NOT EXISTS` ตอนบูต —
ห้ามชี้มันไปที่ไฟล์ warehouse ใหม่เด็ดขาด ไม่งั้นตารางเก่าจะถูกฉีดปนเข้าไปใน database ใหม่

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
  `role` = **Admin|Manager|Operator** (แก้จากเอกสารเดิมที่วาง STAFF|REQUESTER — ดู DATABASE.md ข้อ 6)
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
   **ตัด auto-create สินค้าใน inbound** (SKU ไม่มี → 400) · ฟอร์มรับเข้าถอนกับดัก `|| 10` (3 จุด) · **เส้นถัดไป: dashboard (getDashboardStats)**
   — จุดเชื่อมทุกเส้น: logAudit ฐานใหม่ (`utils/audit.js`, actor_id FK) + ประทับ `created_by`/`resolved_by` = `req.user.id`
   — ทุกเส้นทางที่ย้ายเสร็จ **เขียนเทสต์แบบเบาคู่กันด้วย `node --test`** เฉพาะกติกาที่ database
   บังคับไม่ได้ (ยอดคงเหลือ, สิทธิ์ปิดใบ, การแปลงสถานะของล่าม) — การตัดสินใจ 7 ก.ค. 2026:
   เอา testing "แบบเบา" ไม่ต้องครอบทุก endpoint
   (products: `server/test/productRules.test.js` · auth: `server/test/authRules.test.js` — รวม `npm test` ผ่าน 29 ตัว)
3. **ฟีเจอร์ตามพันธะของข้อมูล:** หน้าจอคิวรออนุมัติของคนคลัง · ฟีเจอร์ปรับยอด (ADJUST) +
   ป้ายเตือนสินค้า 64 ตัวที่ยอดติดลบ (ห้ามเดาตัวเลข ต้องนับของจริง) · แสดง "ไม่รู้ราคา" แทน 0 บาท ·
   ระบบออกรหัสสินค้าตามกลุ่ม · สแกน/พิมพ์ QR (parser + edge cases อยู่ `qr_spec.md` ข้อ 5–6)

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
