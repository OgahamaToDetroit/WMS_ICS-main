# โฟลเดอร์ส่งมอบ (archive) — อ่านได้ ห้ามแก้

> **ชื่อ "Newdatabase" คือฐานที่*ส่งมอบมาตอนเริ่มโปรเจกต์* (ย้ายจาก Excel ครั้งแรก)
> ไม่ใช่ "ฐานเวอร์ชันล่าสุด"** — ฉบับมีชีวิตที่แอปใช้จริงคือ `server/warehouse.dev.db`
> (โครงสร้างที่ `server/prisma/`) โฟลเดอร์นี้เป็น archive อ้างอิงเท่านั้น

| ของ | สถานะ |
|---|---|
| `warehouse.db` | **ต้นฉบับข้อมูลสะอาด ณ วันส่งมอบ** — ตั้ง read-only, checksum อยู่ `warehouse.db.sha256` ใช้เป็นแหล่ง copy ตอนรีเซ็ตฐานพัฒนาและวันขึ้นระบบจริง (ดู [DATABASE.md](../DATABASE.md)) |
| `docs/data_dictionary.md` | **เอกสารอ้างอิงฉบับมีชีวิต** — ไฟล์เดียวในโฟลเดอร์นี้ที่แก้ต่อได้ เมื่อ schema เปลี่ยนต้องอัปเดตตาม |
| `docs/` (ไฟล์อื่น) | **ภาพนิ่งก่อนส่งมอบ** (`database_usage_guide` · `sql_reference` · `handoff_guide`) — บรรยายสภาพวันส่งมอบ **ไม่ตามสคีมาสด**: role ยังเป็นชุดเก่า (STAFF/REQUESTER) และมีคำสั่ง setup/`migrate reset` ที่ repo ปัจจุบันห้าม — role จริง 4 ค่า + กติกาปัจจุบันดู [`CLAUDE.md`](../CLAUDE.md) ข้อ 4 |
| `prisma/` | snapshot ณ วันส่งมอบ — **ห้ามแก้** ฉบับมีชีวิตย้ายไปอยู่ [`server/prisma/`](../server/prisma/) แล้ว migration ใหม่ทุกตัวสร้างที่ฝั่งโน้น |
