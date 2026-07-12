# โฟลเดอร์ส่งมอบ — `warehouse.db` + `prisma/` เป็น archive (ห้ามแก้) · เอกสาร `docs/` บางไฟล์ยังดูแลต่อ

> **ชื่อ "Newdatabase" คือฐานที่*ส่งมอบมาตอนเริ่มโปรเจกต์* (ย้ายจาก Excel ครั้งแรก)
> ไม่ใช่ "ฐานเวอร์ชันล่าสุด"** — ฉบับมีชีวิตที่แอปใช้จริงคือ `server/warehouse.dev.db`
> (โครงสร้างที่ `server/prisma/`) โฟลเดอร์นี้เป็น archive อ้างอิงเท่านั้น

| ของ | สถานะ |
|---|---|
| `warehouse.db` | **ต้นฉบับข้อมูลสะอาด ณ วันส่งมอบ** — ตั้ง read-only, checksum อยู่ `warehouse.db.sha256` ใช้เป็นแหล่ง copy ตอนรีเซ็ตฐานพัฒนาและวันขึ้นระบบจริง (ดู [DATABASE.md](../DATABASE.md)) |
| `docs/data_dictionary.md` | **เอกสารอ้างอิงฉบับมีชีวิต** — data dictionary ที่ต้องอัปเดตตามเมื่อ schema เปลี่ยน |
| `docs/qr_spec.md` | **สเปค domain ที่ยังใช้อยู่** — สเปคระบบ QR สำหรับแอปใหม่ (CLAUDE.md ข้อ 5 + งานค้างข้อ 6 อ้างถึง) ไม่ใช่ภาพนิ่งเก่า |
| `docs/data_flow.md` | **คู่มือแนวคิด core warehouse flow (ยังใช้ได้)** — อธิบายเส้นทางข้อมูลแบบภาษาคน หลักการ (ledger/ไม่เก็บยอด/2 เส้นทาง) ยังจริง · เล่าเฉพาะ 6 ตารางแกน ไม่ครอบ auth/audit/push — ครบทุกตารางดู `data_dictionary.md` |
| `docs/database_usage_guide.md` · `sql_reference.md` · `handoff_guide.md` | **ภาพนิ่งก่อนส่งมอบ** — บรรยายสภาพวันส่งมอบ **ไม่ตามสคีมาสด**: role ยังเป็นชุดเก่า (STAFF/REQUESTER) และมีคำสั่ง setup/`migrate reset` ที่ repo ปัจจุบันห้าม — role จริง 4 ค่า + กติกาปัจจุบันดู [`CLAUDE.md`](../CLAUDE.md) ข้อ 4 |
| `docs/database_erd.png` · `database_structure.html` | **ภาพ/หน้าเว็บ snapshot โครงสร้างวันส่งมอบ** — สร้างอัตโนมัติ ไม่อัปเดตมือ สะท้อนสคีมา ณ วันส่งมอบ (ฉบับสด = `server/prisma/schema.prisma`) |
| `prisma/` | snapshot ณ วันส่งมอบ — **ห้ามแก้** ฉบับมีชีวิตย้ายไปอยู่ [`server/prisma/`](../server/prisma/) แล้ว migration ใหม่ทุกตัวสร้างที่ฝั่งโน้น |

> **ชื่อไฟล์ในเอกสาร `docs/` ที่ขึ้นต้น `etl/out/...` หรือ `warehouse_*.md` (เช่น `verify_report.md`,
> `warehouse_2568_logic_explanation.md`) คือหลักฐาน/รายงานจาก repo ต้นทาง (`ICS-WH_Databasetran`)
> ที่ผลิต database นี้จาก Excel — จงใจไม่รวมมากับ repo web นี้** เขียนเป็นชื่อไฟล์เฉยๆ ไม่ทำเป็นลิงก์
> (กันกด 404) · ถ้าต้องดูจริงต้องเปิดที่ repo ต้นทาง
