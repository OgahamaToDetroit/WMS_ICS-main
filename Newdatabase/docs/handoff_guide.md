# Handoff Guide — คู่มือส่งมอบ database ไป repo web (+ วิธี regenerate)

> ⚠️ **ภาพนิ่งก่อนส่งมอบ — บรรยายสภาพ ณ วันส่งมอบ (การส่งมอบจบไปแล้ว)** · role/จำนวน role
> ในไฟล์นี้เป็นชุดเก่า ระบบปัจจุบันใช้ Admin/Manager/Operator/Viewer · ข้อ regenerate/setup ใช้
> เฉพาะใน repo ต้นทางก่อนส่งมอบ **อย่านำมารันกับ repo ปัจจุบัน** — กติกาที่มีผลจริงดู
> [`../../CLAUDE.md`](../../CLAUDE.md) และ [`../../DATABASE.md`](../../DATABASE.md)

> **ใครอ่าน อ่านเมื่อไหร่:** (1) วันส่งมอบ — คนที่จะ copy ไฟล์ไปตั้งต้น repo web อ่านข้อ 1–6 ตามลำดับ (2) หลังส่งมอบ — ผู้พัฒนา repo web กลับมาดูข้อ 6–7 เมื่อจะแก้ schema (3) ข้อ 8 (regenerate) ใช้เฉพาะใน repo นี้ *ก่อน* ส่งมอบเท่านั้น

---

## 1. การส่งมอบคืออะไร

Repo นี้ (`ICS-WH_Databasetran`) มีหน้าที่เดียว: ผลิต database ตั้งต้นจากระบบ Excel เดิม ผลผลิตที่ส่งมอบมี 3 อย่าง:

```
repo นี้ (โรงงานผลิต — ใช้ครั้งเดียว)          repo web (บ้านจริงของ database ต่อจากนี้)
                                     copy
1. warehouse.db                      ───→   database พร้อมข้อมูล ใช้งานจริงต่อเลย
2. prisma/schema.prisma + migrations ───→   พิมพ์เขียว + ประวัติ — repo web เป็นเจ้าของต่อ
3. docs/ (โฟลเดอร์นี้)               ───→   เอกสารกำกับ — ฉบับฝั่ง web เป็นฉบับจริงต่อจากนี้
```

**เส้นแบ่งความเป็นเจ้าของ (กฎสำคัญที่สุดของเอกสารนี้):**

- **ก่อนส่งมอบ** — แก้ schema ที่ repo นี้ได้เต็มที่ เพราะทุกไบต์ใน `warehouse.db` สร้างคืนจาก Excel ได้เสมอ (ข้อ 8) พังก็เริ่มใหม่ได้ ไม่มีอะไรเสียหายจริง
- **หลังส่งมอบ** — แก้ schema ที่ **repo web เท่านั้น ห้ามกลับมาแก้ที่นี่** เหตุผล: (1) database ฝั่ง web จะเริ่มสะสม transaction จริงจากการใช้งาน ซึ่ง repo นี้*ผลิตซ้ำไม่ได้* — ที่นี่สร้างได้แค่ snapshot จาก Excel ถ้าเอา db จากที่นี่ไปทับ = ประวัติใช้งานจริงหายเกลี้ยง (2) ถ้าแก้ schema สองที่ จะเกิด 2 เวอร์ชันที่ไม่ตรงกัน (drift) ไม่รู้อันไหนคือความจริง
- หลังส่งมอบ repo นี้มีสถานะเป็น **archive อ้างอิง** (หลักฐานว่าข้อมูลย้ายมายังไง ตรวจรับผ่านยังไง) — และเอกสารใน `docs/` ฉบับที่นี่ถือว่า freeze ฉบับที่ copy ไป repo web เป็นฉบับจริงที่แก้ต่อได้

---

## 2. Checklist: copy อะไร / ห้าม copy อะไร

### ✅ Copy ไป repo web

| ไฟล์/โฟลเดอร์ | ทำไม |
|---|---|
| `warehouse.db` | ตัวข้อมูลจริงทั้งหมด (ตาราง `_prisma_migrations` ที่จดประวัติ migration ฝังอยู่ในไฟล์นี้แล้วด้วย) |
| `prisma/schema.prisma` | พิมพ์เขียวโครงสร้าง — repo web แก้ต่อจากไฟล์นี้ |
| `prisma/migrations/` **ทั้งโฟลเดอร์** | ประวัติ migration ต้องตรงกับที่จดใน db — **อย่าลืม `migration_lock.toml`** ข้างใน (ไฟล์เล็กที่ผูกว่า database เป็น sqlite — ขาดแล้ว `migrate` งอแง) |
| `docs/` ทั้ง 3 ไฟล์ | เอกสารกำกับ — data dictionary, QR spec, และไฟล์นี้ |

### ❌ ห้าม copy (แต่ละตัวมีเหตุผล)

| ไฟล์/โฟลเดอร์ | ทำไมถึงห้าม |
|---|---|
| `prisma/seed.js` | มันอ่าน `etl/out/*.json` ซึ่งไม่ได้ไปด้วย — ไปถึงก็รันไม่ได้ และ repo web ไม่ควรมีปุ่ม "ล้างแล้วใส่ข้อมูลตั้งต้น" อยู่ใกล้มือ (ดูคำเตือนข้อ 6) |
| `prisma.config.ts` | สร้างใหม่ให้เหมาะกับ repo web ตาม template ข้อ 4 — **ห้ามลากของเดิมไป เพราะมันลงทะเบียน seed ไว้** ซึ่งจะทำให้ `migrate reset` ฝั่งโน้นพยายาม seed ด้วยไฟล์ที่ไม่มี |
| `.env` | ค่าเฉพาะเครื่อง — สร้างใหม่ (ข้อ 4) |
| `node_modules/`, `generated/` | ของ generate/ติดตั้งใหม่ได้เสมอ (`npm install`, `npx prisma generate`) |
| `etl/`, ไฟล์ `.xlsx` ทุกตัว | pipeline การผลิตกับ archive ต้นทาง — เป็นสมบัติของ repo นี้ |
| `package.json`, `package-lock.json` | repo web มีของตัวเอง — ติดตั้ง dependencies เองตามข้อ 3 |

---

## 3. ติดตั้งฝั่ง repo web

ติดตั้ง 4 แพ็กเกจ:

```
npm install prisma @prisma/client @prisma/adapter-better-sqlite3 dotenv
```

**ให้อยู่บน Prisma เวอร์ชัน 7.x เหมือน repo นี้** (major version เดียวกัน — เลขตัวแรกของเวอร์ชัน ซึ่งเปลี่ยนเมื่อมีของที่ไม่เข้ากันกับของเดิม) เพื่อให้อ่าน migration history ที่ส่งมอบไปได้แน่นอน จะอัปเกรด major ค่อยทำทีหลังเป็นงานแยกของ repo web

### กับดัก Prisma 7 สองเรื่องที่ต้องรู้ (repo นี้เจอมาแล้วทั้งคู่)

**เรื่องที่ 1 — ต้องส่ง driver adapter เสมอ:** ตั้งแต่ Prisma 7 `new PrismaClient()` เปล่า ๆ ใช้ไม่ได้แล้ว (มันไม่รู้จะต่อ database ยังไง) — driver adapter คือตัวเชื่อมระหว่าง Prisma กับไลบรารีต่อ database จริง สำหรับ SQLite ใช้แบบนี้:

```js
const { PrismaClient } = require("./generated/prisma");
const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
```

ตัวอย่างที่รันได้จริงดู `prisma/seed.js` ใน repo นี้ (ไม่ต้อง copy ไฟล์ไป แค่เปิดดูเป็นแบบ)

**เรื่องที่ 2 — เลือก generator ให้ตรงชนิดโปรเจกต์:** ใน `schema.prisma` บล็อก `generator client` มีให้เลือก 2 ตัว:

| โปรเจกต์ของคุณ | ใช้ provider | เหตุผล |
|---|---|---|
| CommonJS (`"type": "commonjs"` — เหมือน repo นี้) | `"prisma-client-js"` | ตัวใหม่ generate เป็น TypeScript/ESM ล้วน ซึ่ง require ไม่ได้ — repo นี้เจอแตกมาแล้วเลยใช้ตัวเดิม |
| TypeScript/ESM (เช่น Next.js — repo web น่าจะเป็นแบบนี้) | `"prisma-client"` (ตัวใหม่, default) | generate TS ให้เข้ากับโปรเจกต์เลย type ครบกว่า |

อย่าลืม gitignore โฟลเดอร์ output ของ generator (repo นี้ใช้ `/generated/prisma`)

---

## 4. สร้าง config + .env

**กับดัก Prisma 7 เรื่องที่ 3: มันไม่อ่าน `.env` ให้เองแล้ว** — ต้อง `import "dotenv/config"` เองใน config (ข้อความเตือนนี้เขียนอยู่ในหัวไฟล์ `.env.example` ของ Prisma เองด้วย)

`prisma.config.ts` เริ่มต้นสำหรับ repo web (สังเกต: **ไม่มี seed** — เจตนา: `prisma/seed.js` ของ repo นี้ไม่ได้ถูก copy มา [ข้อ 2] และต่อให้เขียน seed ของตัวเองก็ไม่ควรลงทะเบียนไว้แบบเงียบ ๆ เพราะ `npx prisma db seed` จะดูเหมือนเป็นคำสั่ง "เติมข้อมูลกลับอย่างปลอดภัย" ทั้งที่ database จริงไม่ควรมีใครมาเติมข้อมูลตั้งต้นซ้ำ):

```ts
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
```

`.env` (gitignore ไฟล์นี้ แล้ว commit `.env.example` ไว้เป็นแม่แบบแทน):

```
DATABASE_URL="file:./warehouse.db"
```

path หลัง `file:` เป็น relative จากโฟลเดอร์ที่รันคำสั่ง — ปรับตามตำแหน่งที่วาง `warehouse.db` จริงใน repo web

---

## 5. Acceptance checklist หลัง copy — พิสูจน์ว่าได้ของครบ

รัน**ก่อนที่แอปจะเขียนข้อมูลแถวแรก** (ตัวเลขด้านล่างการันตีเฉพาะ ณ จุดส่งมอบ — พอแอปเริ่มใช้งาน ตัวเลขจะโตขึ้นเป็นธรรมดา)

**ขั้น 1:** `npx prisma migrate status` → ต้องได้ `Database schema is up to date!` — คำสั่งนี้เทียบโฟลเดอร์ `prisma/migrations/` กับตาราง `_prisma_migrations` ในไฟล์ db ถ้าตรงกันแปลว่า copy มาครบทั้งคู่

**ขั้น 2:** `npx prisma generate` → ผ่านไม่มี error

**ขั้น 3:** รันสคริปต์ตรวจรับ (ตัวอย่างแบบ CommonJS — ถ้าโปรเจกต์เป็น ESM/TS ปรับ import เอง):

```js
// accept.js — ตรวจว่า database ที่รับมอบมาครบถูกต้อง
require("dotenv/config");
const { PrismaClient } = require("./generated/prisma");
const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");

async function main() {
  const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  console.log("item_groups        =", await prisma.itemGroup.count());        // ต้องได้ 23
  console.log("items              =", await prisma.item.count());             // ต้องได้ 2382
  console.log("stock_transactions =", await prisma.stockTransaction.count()); // ต้องได้ 579
  console.log("users              =", await prisma.user.count());             // ต้องได้ 0 (ตารางเตรียมไว้ให้แอป)
  console.log("stock_documents    =", await prisma.stockDocument.count());    // ต้องได้ 0 (ตารางเตรียมไว้ให้แอป)
  console.log("stock_request_items=", await prisma.stockRequestItem.count()); // ต้องได้ 0 (ตารางเตรียมไว้ให้แอป)

  const neg = await prisma.$queryRaw`
    SELECT COUNT(*) AS n FROM (
      SELECT item_id FROM stock_transactions GROUP BY item_id
      HAVING SUM(qty_change) < 0
    )`;
  console.log("ยอดติดลบ           =", Number(neg[0].n));                      // ต้องได้ 64

  const b = await prisma.stockTransaction.aggregate({
    _sum: { qty_change: true }, where: { item_id: "15041" },
  });
  console.log('ยอดตัวอย่าง "15041" =', b._sum.qty_change ?? 0); // ตัวเลข ไม่ใช่ null

  await prisma.$disconnect();
}
main();
```

ค่าคาดหวังทุกตัวมาจากรายงานตรวจรับ [`etl/out/verify_report.md`](../etl/out/verify_report.md) ใน repo ต้นทาง (23 / 2,382 / 579 / ติดลบ 64 — เช็คข้อ 1 และ 3; ยอดรวมทั้งคลัง ณ ส่งมอบ = 3,016.85 — เช็คข้อ 2; `users`/`stock_documents`/`stock_request_items` = 0 ทั้งสาม — เช็คข้อ 8)

**ขั้น 4 (ทางเลือก ไม่ต้องเขียนโค้ด):** `npx prisma studio` เปิด GUI ไล่ดูข้อมูลด้วยตา

---

## 6. Migration แรกใน repo web

ตัวอย่าง: อยากเพิ่มคอลัมน์ `location` ในตาราง `items`

1. แก้ `prisma/schema.prisma` — เพิ่ม `location String?` ใน model `Item`
2. `npx prisma migrate dev --name add_item_location`
3. สิ่งที่เกิด: โฟลเดอร์ใหม่ใต้ `prisma/migrations/` (มีไฟล์ SQL ที่ Prisma สร้าง — เปิดอ่านก่อน apply เป็นนิสัยที่ดี), แถวใหม่ในตาราง `_prisma_migrations`, และ client ถูก generate ใหม่
4. commit `schema.prisma` + โฟลเดอร์ migration ใหม่*คู่กันเสมอ* (สองอย่างนี้คือชุดเดียวกัน แยกกันแล้วเพื่อนร่วมทีม/เครื่องอื่น migrate ไม่ได้)

> 🟥 **คำเตือนสำคัญที่สุดในเอกสารนี้ — `npx prisma migrate reset` ฝั่ง repo web = ทำลายข้อมูลจริง**
>
> `migrate reset` ล้างตาราง**ทั้งหมด**แล้วรัน migration ใหม่ **แต่ไม่ seed ให้อัตโนมัติ** (พิสูจน์แล้วจากการรันจริงตอนทำเอกสารชุดนี้ — เป็นจุดที่เข้าใจผิดกันบ่อย) แปลว่าหลัง reset จะได้ **database เปล่าเสมอ ไม่ว่าจะลงทะเบียน seed command ไว้หรือไม่**
>
> ใน repo ต้นทาง เรื่องนี้ไม่อันตราย เพราะรู้ตัวอยู่แล้วว่าต้องรัน `npx prisma db seed` ต่อเองเพื่อเติมข้อมูลจาก Excel กลับมา (ดูข้อ 8) แต่ใน repo web มันคือคนละเรื่อง: **transaction จริงที่ผู้ใช้บันทึกมาทั้งหมดหายถาวรทันทีที่ reset ทำงาน ไม่มีทางสร้างคืน** เพราะไม่มี seed แหล่งไหนรู้จักข้อมูลที่เกิดขึ้นจริงหลังวันส่งมอบเลย (repo web ไม่ได้ copy `prisma/seed.js` ไปตามข้อ 2 อยู่แล้ว — และต่อให้ copy ไปก็ช่วยอะไรไม่ได้ เพราะมันรู้จักแค่ snapshot วันส่งมอบ ไม่รู้จัก 90 วันที่ผ่านมาหลังจากนั้น)
>
> ถ้า Prisma ชวนให้ reset (เช่นตอน migration history ขัดกัน) **หยุดคิดก่อนเสมอ** และสำรองไฟล์ก่อนทุกครั้ง
>
> **นิสัยสำรองข้อมูลที่ควรมี:** SQLite ทั้ง database คือไฟล์เดียว — ปิดแอป แล้ว copy `warehouse.db` เก็บไว้ (ตั้งชื่อมีวันที่ เช่น `warehouse-2569-01-15.db.bak`) ทำก่อน `migrate dev` ทุกครั้งที่แตะ db จริง ต้นทุน 5 วินาที

ข้อควรระวังเพิ่ม: **การ rename คอลัมน์** — Prisma มองเป็น "ลบคอลัมน์เก่า + เพิ่มคอลัมน์ใหม่" = ข้อมูลในคอลัมน์นั้นหาย ให้เปิดไฟล์ SQL ที่ generate มาตรวจก่อน apply ถ้าเห็น `DROP` ที่ไม่ได้ตั้งใจให้หยุด (แก้ SQL เป็น `ALTER TABLE ... RENAME COLUMN` เองได้)

---

## 7. หน้าที่ของแอป — พันธะที่มากับข้อมูล

สรุปกติกาที่โค้ดฝั่งแอปต้องเคารพ (รายละเอียดอยู่ในเอกสารอ้างอิงแต่ละข้อ):

| หน้าที่ | อ่านเพิ่ม |
|---|---|
| คุมค่า `type` ให้มีแค่ `OPENING`/`IN`/`OUT`/`ADJUST` (SQLite ไม่มี enum — database ไม่ช่วยกัน) | [`data_dictionary.md`](data_dictionary.md) ข้อ 5 |
| คำนวณยอดด้วย `COALESCE(SUM(qty_change), 0)` เสมอ — ห้ามทำคอลัมน์เก็บยอด | data_dictionary ข้อ 8 |
| แสดงเตือนสินค้า 64 ตัวที่ยอดติดลบ + ทำฟีเจอร์ปรับยอด (`ADJUST`) ให้แก้หลังนับของจริง — ห้ามเดาตัวเลข | data_dictionary ข้อ 9 |
| ลบสินค้า = soft delete (`is_active = false`) เท่านั้น | data_dictionary ข้อ 4 |
| ห้าม reuse `item_id` ตลอดกาล | [`qr_spec.md`](qr_spec.md) ข้อ 1 |
| parse ป้าย QR เดิม 9 หลักตามสเปค (5 ตัวท้าย = คีย์) | qr_spec ข้อ 5 |
| `latest_cost`/`unit_cost` ที่เป็น NULL = "ไม่รู้ราคา" — แสดงตามนั้น ห้ามแสดงเป็น 0 บาท | data_dictionary ข้อ 2 |
| คุมค่า `doc_type` ให้มีแค่ `RECEIVE`/`ISSUE` (enum จำลองเหมือน `type`) | data_dictionary ข้อ 6 |
| ทุกรายการ `IN`/`OUT` ต้องมี `document_id` ผูกใบเสมอ (แม้เบิก/รับชิ้นเดียวก็สร้างใบ 1 บรรทัด) — `OPENING`/`ADJUST` ต้องเป็น NULL เสมอ | data_dictionary ข้อ 6 |
| ประทับ `type` ของรายการลูกตามชนิดใบอัตโนมัติ (`RECEIVE`→`IN`, `ISSUE`→`OUT`) — ห้ามให้ผู้ใช้เลือกเอง | data_dictionary ข้อ 6 |
| ออกเลข `doc_no` เอง (database บังคับแค่ห้ามซ้ำ) | data_dictionary ข้อ 6 |
| ประทับ `created_by` จากคนที่ login แล้วเท่านั้น — ห้ามให้ผู้ใช้เลือกชื่อจาก dropdown (ไม่งั้น audit trail ไม่น่าเชื่อถือ) | data_dictionary ข้อ 7 |
| ลบคนคลัง = soft delete (`is_active = false`) เท่านั้น; ตอนทำระบบ login ห้ามเก็บรหัสผ่านจริงเด็ดขาด เก็บแต่ผล hash (เช่น bcrypt) | data_dictionary ข้อ 7 |
| คุมค่า `status` ให้มีแค่ `PENDING`/`CONFIRMED`/`CANCELLED` และ `users.role` ให้มีแค่ `STAFF`/`REQUESTER` (enum จำลอง) | data_dictionary ข้อ 6, 7 |
| ใบ `ISSUE` ต้องเริ่มที่ `status=PENDING` เสมอ (ไม่มีทางลัด CONFIRMED ทันที), ใบ `RECEIVE` เริ่ม `CONFIRMED` เสมอ | data_dictionary ข้อ 6.1 |
| ตอนกด "ขอเบิก" ห้ามสร้างแถวใน `stock_transactions` — พักไว้ที่ `stock_request_items` ก่อน จนกว่าคนคลังยืนยัน (ไม่งั้นยอดลดทั้งที่ของยังไม่ออก) | data_dictionary ข้อ 6.1 |
| ตอนคนคลังยืนยัน: สร้าง `stock_transactions` จาก `qty_confirmed` (ไม่ใช่ `qty_requested`), เซ็ต `resolved_by`/`resolved_at`, `status=CONFIRMED` | data_dictionary ข้อ 6.1 |
| เฉพาะ `role=STAFF` เท่านั้นกดยืนยัน/ยกเลิกคำขอได้ — เช็ค role ของคน login ก่อนทุกครั้ง (database บังคับไม่ได้) | data_dictionary ข้อ 6.1, 7 |

---

## 8. คู่มือสร้าง database ใหม่จากศูนย์ (ใช้ใน repo นี้ ก่อนส่งมอบเท่านั้น)

ใช้เมื่อ: แก้ schema ก่อนส่งมอบ / สงสัยว่าไฟล์ db เพี้ยน / clone repo ใหม่มาทำงาน

**ของที่ต้องมีก่อน:** Node.js 25 + npm 11 (`npm install` ครั้งแรก), Python 3.13 + openpyxl (`pip install openpyxl`), ไฟล์ `.env` (copy จาก `.env.example`) — เรื่อง encoding ภาษาไทยบน Windows console สคริปต์จัดการตัวเองแล้ว ไม่ต้องตั้งอะไร

รัน 4 คำสั่งจาก root ของ repo ตามลำดับ:

```
python etl/transform.py           # อ่าน Excel → เขียน etl/out/*.json + รายงาน
                                  # คาดหวัง: "เขียนไฟล์เสร็จ ... groups 23 / items 2382 / openings 579"
                                  # สคริปต์นี้ deterministic — รันซ้ำได้ไฟล์เหมือนเดิมทุกไบต์
                                  # (เช็คได้: git status ต้องไม่เห็น etl/out เปลี่ยน)

npx prisma migrate reset --force  # ล้าง db แล้วรัน migration ทุกตัวใหม่ — ได้ตารางเปล่า
                                  # (--force เพราะรันใน shell ที่ตอบ prompt ไม่ได้ —
                                  #  reset ปลอดภัยใน repo นี้เพราะทุกอย่างสร้างคืนจาก Excel ได้)
                                  # ⚠️ พิสูจน์แล้วว่า Prisma 7.8.0 คำสั่งนี้ "ไม่" seed ให้อัตโนมัติ
                                  #    (เคยเข้าใจผิดว่ามันทำให้ — เช็คจากรันจริงแล้วตารางว่างเปล่า)
                                  #    ต้องรันขั้นถัดไปแยกต่างหากเสมอ

npx prisma db seed                # เติมข้อมูลจาก etl/out/*.json (ขั้นที่ขาดไม่ได้!)
                                  # คาดหวัง: "seed สำเร็จ: item_groups 23 / items 2382 / stock_transactions 579"
                                  # กันรันซ้ำในตัว — ถ้าตารางมีข้อมูลอยู่แล้วจะหยุดทันที (ดู prisma/seed.js)

python etl/verify.py              # ตรวจรับ 8 เช็คเทียบ Excel ต้นทางโดยตรง
                                  # คาดหวัง: [PASS] ทั้ง 8 ข้อ + "ผ่านทั้งหมด"
```

> **ผลข้างเคียงที่ต้องรู้:** `transaction_date` ของยอดยกมาทั้ง 579 แถวจะถูกประทับใหม่เป็นเวลาที่รันรอบนี้ (กติกาตามการตัดสินใจข้อ 6 — ยอด snapshot ณ วันย้ายข้อมูลจริง) และ `etl/out/verify_report.md` จะถูกเขียนใหม่ตาม db ใหม่
>
> ถ้าแค่*ทดลอง*แล้วอยากกลับไปใช้ db เดิมที่ commit ไว้: `git checkout -- warehouse.db` แล้วรัน `python etl/verify.py` ซ้ำอีกรอบ (report จะกลับเป็นเนื้อหาเดิมเอง เพราะ generate จาก db ที่ restore แล้ว) — ปิด `prisma studio` ก่อนถ้าเปิดค้าง ไม่งั้น Windows ล็อกไฟล์ไว้

**หลังส่งมอบแล้ว:** ห้ามใช้ขั้นตอนนี้ผลิต db ส่งไป repo web ซ้ำ (เหตุผลอยู่ข้อ 1) — ถ้าวันหน้าอยาก import ประวัติรับเข้า/เบิกออกจาก Excel (`Input_Clean` 2,348 แถว / `Output_Clean` 2,529 แถว) นั่นเป็น*โปรเจกต์ฝั่ง repo web* ที่เขียนสคริปต์ import ยิงเข้า database จริงที่มีชีวิตอยู่ โดยใช้ไฟล์ Excel ที่ archive ไว้ใน repo นี้เป็นข้อมูลต้นทาง (ข้อจำกัดของข้อมูลชุดนั้นดู [`data_dictionary.md`](data_dictionary.md) ข้อ 11)
