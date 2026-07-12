# integration tests — อ่านก่อนแตะ

ยิง HTTP จริงผ่าน `supertest` ใส่ `server/app.js` (app ที่ยังไม่ listen) ต่อกับฐาน SQLite
ชั่วคราว — พิสูจน์สายไฟ route → middleware → controller → Prisma → ฐานจริง
(ต่างจากเทสต์ใน `server/test/*.test.js` ที่ตรวจ pure functions อย่างเดียว)

รัน: `npm test` จากรากโปรเจกต์ (node --test เจอไฟล์ `*.test.js` เองอัตโนมัติ)

## โครง

- `setup.js` — สร้างฐานชั่วคราวใน os.tmpdir → `prisma migrate deploy` → seed fixtures
  (admin/operator/viewer + สินค้า 3 ตัว + แถว OPENING) → dynamic import app/prisma →
  คืน `{ app, prisma, fixtures, cleanup }`
- **แต่ละไฟล์เทสต์เรียก `setupIntegrationTest()` ของตัวเอง** — `node --test` รันแต่ละไฟล์
  คนละ process ห้ามแชร์ไฟล์ฐานข้ามไฟล์เทสต์ (จะแย่งเขียนกันแบบสุ่ม)

## กับดักที่เจอจริง (12 ก.ค. 2026) — อย่าเสียเวลาเจอซ้ำ

1. **Node 25 บล็อก spawn ไฟล์ `.cmd` ที่ไม่มี `shell:true` → EINVAL** (security fix
   CVE-2024-27980) และ `npx` ใน shell non-interactive อาจแขวนรอ prompt — จึงเรียก Prisma CLI
   ตรงด้วย `spawnSync(process.execPath, [<node_modules/prisma/build/index.js>, ...])`
   (bin ของ package prisma ชี้ไฟล์นี้ — CLI ตัวเดียวกับที่ npx เรียก)
2. **schema engine ไม่สร้างไฟล์ฐานใหม่ใน temp เอง** → pre-create ไฟล์ว่างก่อน migrate deploy
3. **ต้องตั้ง `DATABASE_URL` (absolute path) ก่อน dynamic import `app.js`/`prisma.js`** —
   dotenv ไม่ทับ env ที่ตั้งแล้ว แต่ **static import จะ hoist ไปโหลดก่อนตั้งค่า** =
   เทสต์เขียนใส่ฐานพัฒนาเงียบๆ · เกณฑ์กันพลาด: mtime/size ของ `server/warehouse.dev.db`
   ก่อน/หลัง `npm test` ต้องเท่ากัน
4. **ห้ามยิง `GET /api/events` ผ่าน supertest** — SSE เปิด connection ค้างตลอดชีพ
   เทสต์แขวนไม่จบ (พฤติกรรม SSE พิสูจน์ด้วย browser ไปแล้วตอนเฟส 3/4 — ดู `docs/WORKLOG.md`)
5. **`node --test` นับ `setup.js` เป็น 1 pass** (ไฟล์ใต้ `test/` ที่ไม่มี test case) —
   ยอดรวมจึงเป็น 99 unit + 12 integration + 1 helper = 112 ไม่ใช่ 111

## ข้อควรรู้ตอนเขียนเทสต์เพิ่ม

- rate limiter เก็บ state ใน memory ต่อ process: login นับเฉพาะครั้ง*พลาด* 15/15นาที ·
  register 10/ชม. — อย่าสมัครเกิน 10 คนต่อไฟล์เทสต์
- push ไม่มี VAPID = warn เฉยๆ · `broadcast()` ไม่มีคนฟัง = no-op — ไม่ต้อง mock
- fixtures สร้างผ่าน Prisma ตรงในเทสต์เท่านั้น — repo นี้*ตั้งใจไม่มี seed script ถาวร*
