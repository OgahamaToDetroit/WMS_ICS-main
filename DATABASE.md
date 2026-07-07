# DATABASE.md — ระเบียบการจัดการฐานข้อมูลของโปรเจกต์นี้

> สรุปจากการหารือวันที่ 7 ก.ค. 2026 — เอกสารเชิงลึกของตัว database อยู่ที่ [`Newdatabase/docs/`](Newdatabase/docs/)
> (data_dictionary, usage guide, handoff guide, qr_spec) ไฟล์นี้ว่าด้วย *ระเบียบการทำงาน* ของ repo นี้เท่านั้น

---

## 1. ไฟล์ database มี 3 บทบาท

| ไฟล์ | บทบาท | กติกา |
|---|---|---|
| `Newdatabase/warehouse.db` | **ต้นฉบับส่งมอบ (golden master)** — ข้อมูลสะอาด ณ วันรับมอบ (สินค้า 2,382 / กลุ่ม 23 / ยอดยกมา 579) | ตั้ง read-only แล้ว **ห้ามแอป/Prisma ชี้มาที่ไฟล์นี้ ห้ามแก้ตลอดกาล** — checksum อยู่ที่ `warehouse.db.sha256` ใช้ตรวจความสมบูรณ์ได้ (`Get-FileHash -Algorithm SHA256`) |
| `server/warehouse.dev.db` | **ฐานพัฒนา (สนามทดลอง)** | ทดลองใส่ข้อมูล/ทดสอบฟีเจอร์ได้เต็มที่ พังแล้ว**รีเซ็ตด้วยการ copy จากต้นฉบับ** (ดูข้อ 2) — ไฟล์นี้ถูก gitignore ไม่ขึ้น git |
| `warehouse.db` (บนเครื่องจริง) | **ฐาน production** — ยังไม่มีจนกว่าจะถึงวันขึ้นระบบ | เกิดจากพิธีวันขึ้นระบบ (ข้อ 4) — นาทีแรกที่มีข้อมูลจริง ไฟล์นี้คือสำเนาเดียวในโลก ต้องมี backup รายวันทันที |

**หลักคิด:** "schema" เดินทางเป็นสคริปต์ migration (replay ที่ไหนก็ได้) ส่วน "ข้อมูลทดลอง" ติดอยู่ในไฟล์ dev
และตายไปพร้อมไฟล์ — สองอย่างนี้แยกกัน ทำให้ dev เลอะแค่ไหนก็ไม่เปื้อนวันขึ้นจริง

**ตำแหน่ง schema ฉบับมีชีวิต:** `server/prisma/` (แก้โครงสร้าง + สร้าง migration ที่นี่ที่เดียว)
— ส่วน `Newdatabase/prisma/` คือ snapshot วันส่งมอบ **ห้ามแก้** (ดู `Newdatabase/README.md`)

---

## 2. พิธีกรรมประจำวัน (ระหว่างพัฒนา)

### รีเซ็ตฐานพัฒนาให้กลับสะอาด
```powershell
.\scripts\db-reset-dev.ps1
# = ปิดแอปก่อน → copy ต้นฉบับทับ dev → ปลด read-only → migrate deploy ให้ schema ตามทัน
```
> **ห้ามใช้ `npx prisma migrate reset` เป็นปุ่มรีเซ็ต** — ฝั่งเราไม่มี seed ที่รู้จักข้อมูลส่งมอบ
> reset แล้วได้ตารางเปล่า (handoff guide ข้อ 6 เตือนไว้เป็นคำเตือนใหญ่สุดของเอกสาร)

### ก่อนแก้โครงสร้าง (migrate dev) ทุกครั้ง
1. สำรองก่อน: `.\scripts\db-backup.ps1`
2. แก้ `schema.prisma` → `npx prisma migrate dev --name อธิบายสั้นๆ`
3. **เปิดอ่านไฟล์ SQL ที่ generate ก่อน apply** — เห็น `DROP` ที่ไม่ได้ตั้งใจ (เช่นจากการ rename คอลัมน์) ให้หยุด
   แล้วแก้เป็น `ALTER TABLE ... RENAME COLUMN` เอง
4. อัปเดต `Newdatabase/docs/data_dictionary.md` ให้ตรงกับ schema ใหม่
5. commit ทั้งชุดเดียวกัน: schema.prisma + โฟลเดอร์ migration ใหม่ + เอกสารที่แก้

### ซ้อมขึ้นจริง (ทำทุกครั้งที่มี migration ใหม่)
```powershell
.\scripts\db-rehearse.ps1
# = copy ต้นฉบับไปไฟล์ชั่วคราว → migrate deploy → ตรวจรับด้วย server/accept.js → ลบทิ้ง
# ผ่านที่นี่ = วันขึ้นจริงจะผ่าน
```
> เหตุผลที่ต้องซ้อม: migration ที่ผ่านบนฐาน dev อาจตายบนข้อมูลต้นฉบับ (เช่น ใส่ UNIQUE
> ให้ชื่อสินค้า ทั้งที่ข้อมูลจริงมีชื่อซ้ำ 15 คู่รออยู่) — ขั้นตอนที่ไม่เคยซ้อม = ยังไม่รู้ว่าใช้ได้จริง

---

## 3. ข้อห้ามเด็ดขาด

- ห้าม `npx prisma migrate reset` (ได้ฐานเปล่า ไม่มีทางกู้ข้อมูลส่งมอบคืนจากฝั่งนี้)
- ห้าม copy ไฟล์ `.db` ขณะเซิร์ฟเวอร์/Prisma Studio เปิดอยู่ (โหมด WAL — ได้สำเนาครึ่งๆ กลางๆ)
- ห้ามแตะตาราง `_prisma_migrations` (สมุดจดประวัติ migration ของ Prisma)
- ห้าม `DELETE` แถวใน users/items/documents — ใช้ soft delete (`is_active = 0`) เสมอ (FK ตั้ง RESTRICT ไว้ database จะเตะเองอยู่แล้ว)
- ต้นฉบับ `Newdatabase/warehouse.db` ต้องมีสำเนานอกเครื่องอย่างน้อย 1 ชุด (Google Drive / USB)
  — โฟลเดอร์นี้ไม่มี ETL/Excel ต้นทางติดมา ถ้าดิสก์พังจะผลิตคืนเองไม่ได้

---

## 4. พิธีวันขึ้นระบบจริง (launch day)

1. ปิดทุกอย่าง
2. `Copy-Item Newdatabase\warehouse.db <ตำแหน่ง production>\warehouse.db`
3. ชี้ `DATABASE_URL` ไปที่ไฟล์นั้น → `npx prisma migrate deploy` (เติมโครงสร้างที่พัฒนาระหว่างทางทั้งหมด โดยไม่แตะข้อมูล)
4. รันเช็คตรวจรับ (ข้อ 5) — ต้องผ่านทุกตัว
5. สร้างผู้ใช้ Admin คนแรกผ่านช่องทางที่เตรียมไว้
6. เปิด backup อัตโนมัติรายวันทันที (Task Scheduler copy ไฟล์ตอนกลางคืนก็เพียงพอ)

## 5. ตัวเลขตรวจรับ (ค่า ณ วันส่งมอบ — ใช้เช็คหลัง copy/ซ้อม/ขึ้นจริง)

รันอัตโนมัติได้: `node server/accept.js <path-ไฟล์-db>` (ค่าเริ่มต้น `./warehouse.dev.db` — รันจากโฟลเดอร์ server/)

| เช็ค | ค่าที่ต้องได้ |
|---|---|
| `item_groups` | 23 |
| `items` | 2,382 |
| `stock_transactions` | 579 (เป็น OPENING ทั้งหมด) |
| `users` / `stock_documents` / `stock_request_items` | 0 / 0 / 0 |
| สินค้าที่ยอดติดลบ | 64 |
| ยอดรวมทั้งคลัง `SUM(qty_change)` | 3,016.85 |
| checksum ไฟล์ต้นฉบับ | ตรงกับ `Newdatabase/warehouse.db.sha256` |

---

## 6. การตัดสินใจที่ล็อกแล้ว (7 ก.ค. 2026) — จะ codify ลง data_dictionary ตอนเฟส 1

1. **ยกเลิกใบเบิก:** ผู้ขอกดยกเลิกใบของตัวเองได้เฉพาะตอนยัง `PENDING`; Admin/Manager ยกเลิก/ปฏิเสธได้ทุกใบ
   (ปรับกติกาเดิมของเอกสารที่ให้เฉพาะ STAFF — เราเป็นเจ้าของกติกาแล้ว แก้พร้อมจดเหตุผล)
2. **บทบาทผู้ใช้:** `users.role` ใช้ 3 ค่า `Admin | Manager | Operator` (คงชื่อเดิมของระบบ —
   Admin+Manager มีสิทธิ์ระดับ STAFF ของเอกสารเดิม, Operator = REQUESTER)
3. **ป้ายสถานะ ปฏิเสธ/ยกเลิก:** ไม่เก็บเป็นค่าแยก — คำนวณตอนแสดงผล:
   `CANCELLED` + `resolved_by == requested_by` → "ยกเลิก" / ไม่เท่ากัน → "ปฏิเสธ"
   กรณีอนุมัติ 0 ทุกบรรทัด → บันทึกเป็น `CANCELLED` + note (ห้ามมีใบ CONFIRMED ที่ไม่มี transaction)
4. **รหัสสินค้า:** ระบบออกรหัสให้ตามกลุ่ม (5 หลัก, 2 ตัวแรก = กลุ่ม) ผู้ใช้พิมพ์รหัสเองไม่ได้อีกต่อไป
   ห้าม reuse รหัส ห้าม auto-create สินค้าจากการสแกน/พิมพ์รหัสที่ไม่มีในทะเบียน (ตาม qr_spec)
