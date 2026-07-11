# WMS / ICS — ระบบคลังสินค้า

ระบบจัดการคลังสินค้า: หน้าเว็บ React + หลังบ้าน Express + ฐานข้อมูล SQLite (จัดการ schema ด้วย Prisma)
สถานะปัจจุบัน: ย้ายระบบทั้งหลังบ้านและหน้าบ้านมาใช้ฐานใหม่ครบแล้ว พร้อมฟีเจอร์ auth/role,
รับเข้า–เบิกออก–อนุมัติ–ส่งมอบ, SSE, Web Push และ PWA (ตรวจรวมล่าสุด 11 ก.ค. 2026)

## โครงสร้างโปรเจกต์

```
├── src/                      หน้าเว็บ React (Vite + Tailwind/DaisyUI)
├── server/                   หลังบ้าน Express (ESM)
│   ├── prisma/               ★ schema + migrations ฉบับมีชีวิต — แก้โครงสร้าง db ที่นี่ที่เดียว
│   ├── prisma.config.ts      ตั้งค่า Prisma CLI (อ่าน .env เอง, ไม่มี seed โดยเจตนา)
│   ├── warehouse.dev.db      ฐานพัฒนา (gitignore) — เลอะได้ รีเซ็ตได้ตลอด
│   ├── accept.js             สคริปต์ตรวจรับ database เทียบตัวเลขวันส่งมอบ
│   ├── controllers/ routes/  โค้ด API บนฐานใหม่ผ่าน Prisma
│   └── test/ utils/           กติกาที่แยกทดสอบได้ด้วย node --test
├── Newdatabase/              โฟลเดอร์ส่งมอบ (archive อ่านอย่างเดียว — ดู README ข้างใน)
│   ├── warehouse.db          ★ ต้นฉบับข้อมูลสะอาด (read-only + checksum)
│   └── docs/                 เอกสาร database ฉบับเต็ม (data dictionary, usage guide, QR spec)
├── scripts/                  สคริปต์ดูแลฐานข้อมูล (backup / reset dev / ซ้อมขึ้นจริง)
├── backups/                  ที่เก็บสำรอง (gitignore)
└── DATABASE.md               ★ ระเบียบการจัดการฐานข้อมูล — อ่านก่อนแตะ db ทุกครั้ง
```

## เริ่มพัฒนา

```bash
npm install                    # ติดตั้งฝั่งหน้าเว็บ (ครั้งแรก)
npm --prefix server install    # ติดตั้งฝั่งเซิร์ฟเวอร์ (ครั้งแรก)
cp server/.env.example server/.env   # แล้วปรับค่าในไฟล์ (ครั้งแรก)
npm run dev:all                # รันหน้าเว็บ (5173) + เซิร์ฟเวอร์ (5000) พร้อมกัน
```

## ตรวจคุณภาพ

```bash
npm test                       # เทสต์กฎธุรกิจและตัวแปลงข้อมูล
npm run lint                   # ตรวจ source (ไม่ตรวจ Prisma client ที่ generate อัตโนมัติ)
npm run build                  # สร้าง bundle ของหน้าเว็บ
```

## กติกาเรื่องฐานข้อมูล (ฉบับย่อ — ฉบับเต็มอยู่ DATABASE.md)

- ต้นฉบับ `Newdatabase/warehouse.db` ห้ามแตะ — แอปใช้ `server/warehouse.dev.db` เท่านั้น
- อยากได้ฐานสะอาด: รัน `.\scripts\db-reset-dev.ps1`
- ก่อน `prisma migrate dev` ทุกครั้ง: รัน `.\scripts\db-backup.ps1` และเปิดอ่าน SQL ที่ generate ก่อน apply
- มี migration ใหม่เมื่อไหร่: รัน `.\scripts\db-rehearse.ps1` เพื่อพิสูจน์ว่าวันขึ้นระบบจริงจะผ่าน
- ห้าม `prisma migrate reset` เด็ดขาด
