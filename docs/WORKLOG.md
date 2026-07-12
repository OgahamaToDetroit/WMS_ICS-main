# WORKLOG — สมุดบันทึกงาน (append-only)

> **กติกาไฟล์นี้:** จบเซสชัน/จบงานชิ้นใหญ่ ให้**ต่อท้าย**บันทึกใหม่พร้อมวันที่และ commit hash
> ห้ามแก้บันทึกเก่า (ประวัติต้องคงความจริงของเวลานั้น — ถ้าข้อมูลล้าสมัยให้จดบันทึกใหม่ว่าเปลี่ยนเมื่อไหร่)
> กฎถาวร/ข้อห้ามไม่อยู่ที่นี่ — อยู่ `CLAUDE.md` · การตัดสินใจเรื่องฐานข้อมูลตัวจริงอยู่ `DATABASE.md` ข้อ 6

---

## 7 ก.ค. 2026 — เลือก generator + แนวเทสต์

- **พิสูจน์ generator `prisma-client-js` ใช้ได้จริงกับ ESM:** `import { PrismaClient } from
  './generated/prisma/index.js'` จากไฟล์ ESM ต่อ adapter + query สำเร็จ — เกณฑ์เลือก generator
  ที่ถูกต้องคือ *"โปรเจกต์มี TypeScript build step ไหม"* ไม่ใช่ ESM/CommonJS อย่างที่ตาราง
  ในเอกสารส่งมอบเขียน (เอกสารส่งมอบแนะนำ `prisma-client` ตัวใหม่ แต่ตัวนั้น generate เป็น
  TypeScript ซึ่ง repo นี้เป็น JS ล้วนไม่มี build step)
- **ตัดสินใจแนวเทสต์ "แบบเบา":** เขียนเทสต์คู่กับทุกเส้นทางที่ย้าย ด้วย `node --test`
  เฉพาะกติกาที่ database บังคับไม่ได้ (ยอดคงเหลือ, สิทธิ์ปิดใบ, การแปลงสถานะของล่าม)
  ไม่ต้องครอบทุก endpoint

## 8 ก.ค. 2026 — migration ชุดแรกบนฐานใหม่

- **Migration auth เสร็จ** (commit `0e19dcd`) — `users`/`password_reset_tokens`/`audit_logs`
- **min_stock/image_url ลง items** (migration `20260708143409` — การตัดสินใจ DATABASE.md ข้อ 6.8)

## 9 ก.ค. 2026 — ย้าย data layer: products / auth / transactions

- **products ย้ายเสร็จ:** CRUD ทั้งชุดอยู่ฐานใหม่ · ระบบออกรหัส MAX+1 ตามกลุ่ม ·
  ยอดเริ่มต้น = ใบ RECEIVE อัตโนมัติ (doc_no ตามตัวอย่างเอกสารส่งมอบ `REC-6907-0001`) ·
  bulk import พักทั้งปุ่ม+endpoint · ฟอร์ม React ถอนกับดัก `|| 10` แล้ว
- **auth ย้ายเสร็จ:** `userManager` เป็น Prisma async (ไม่ seed ตอน import) · กติกาแยกเทสต์ที่
  `utils/authRules.js` (login 2 แกน status=Active+is_active, โทเคนใช้ครั้งเดียว/หมดอายุ,
  ทรง user ต่อ endpoint) · `createAdmin.js` upsert admin ฐานใหม่ · ลบผู้ใช้ = soft delete
  (is_active=false) — สังเกตผลข้างเคียง: username/email ของบัญชีที่ปิดยังถูกจองโดย unique
  constraint (12 ก.ค. จัดประเภทใหม่เป็น "ข้อจำกัดรอเคาะ" — ดู backlog ใน CLAUDE.md)
- **transactions ย้ายเสร็จ:** ทั้ง 6 endpoint (request/inbound/list/history/resolve/cancel)
  อยู่ฐานใหม่ · `utils/transactionRules.js` แปลง 3 ตาราง (StockDocument+StockRequestItem+
  StockTransaction) → ทรง JSON เดิม 5 สถานะ · `resolveOutcome` (pure) ตัดสินอนุมัติ ·
  ISSUE PENDING พักที่ stock_request_items → สร้าง OUT ตอน confirm จาก qty_confirmed +
  copy project หัวใบลงบรรทัด · ตัด auto-create สินค้าใน inbound · ฟอร์มรับเข้าถอนกับดัก `|| 10` (3 จุด)
- **เจอจริง — กับดัก Prisma client ค้างเก่า:** migration เพิ่ม `min_stock` ผ่านไปแล้ว
  แต่ client เก่าไม่รู้จัก field → insert พังทั้งที่ database ถูกต้อง (ที่มาของกฎ "แก้ schema
  แล้วต้อง `npx prisma generate` + restart เสมอ" ใน CLAUDE.md ข้อ 3)

## 10 ก.ค. 2026 — dashboard + ลบระบบเก่า + เฟส 0/1/2 ของแผน reference

- **dashboard ย้ายเสร็จ:** `getDashboardStats` (ใน `productController`) เป็น Prisma ล้วน
  ทั้ง `stats`/`activities`/`stockLevels` (ตามคำขอ "ทำให้เหมือนต้นฉบับ" ไม่ตัดฟิลด์ไหนทิ้ง) ·
  `activities` reuse `mapDocumentToTransaction`/`DOCUMENT_INCLUDE` ตัวเดียวกับ `/api/transactions`
  (ย้าย `DOCUMENT_INCLUDE` ไป `utils/transactionRules.js` ให้ 2 controller ใช้ร่วมกัน
  กันบั๊ก "ลืม include requestItems" ซ้ำ) · `lowStockCount`/`stockLevels.minStock` ไม่ default
  เป็น 10 เมื่อยังไม่ตั้งเกณฑ์ — ต่างจาก SQL เดิมที่ปน "ของหมด" กับ "สต็อกต่ำ" เป็นตัวเลขเดียว
  ตอนนี้นับเฉพาะ `computeStatus()==='Low Stock'` จริง · เจอกับดัก P2029 ครั้งแรกที่นี่
  (ยกขึ้นเป็นกฎถาวรใน CLAUDE.md ข้อ 3 แล้ว)
- **เก็บกวาดฐานเก่า (= เฟส 0):** ลบ `server/db.js` + `identifier.sqlite`(+wal/shm) —
  grep ยืนยันไม่มีใครเรียกใช้ทั้ง repo (`data/users.json` ไม่มีอยู่จริง ไม่ต้องลบ) ·
  `.gitignore` โฟลเดอร์ `wms-ics-reference/` · อัปเดตเอกสารครบ
- **ตกลงแผนอัปเดตตาม `wms-ics-reference/`:** ใช้เป็นสเปคอ้างอิงเท่านั้น (เหตุผลถาวรอยู่
  CLAUDE.md) · เคาะเอาครบทั้ง 4 เรื่องที่แตะกติกา/สคีมา: role Viewer · คิวรอส่งมอบ ·
  session เดี่ยว · Web Push — ทั้ง 4 บันทึกลง DATABASE.md ข้อ 6.13–6.16 (= เฟส 1)
  ก่อนแตะโค้ด · แบ่งเฟส 2 ทำ ~3 เซสชัน (A=สามข้อแรกไม่แตะ schema · B=สอง migration เล็ก ·
  C=Web Push)
- **เฟส 2 เสร็จครบ 6 ฟีเจอร์** (1 ฟีเจอร์ = 1 commit + เทสต์เบา · migration แยก commit
  ชุดของใครมันตามกติกา schema):
  - **SSE `/api/events`** — `server/events.js` + กติกา/เทสต์ `utils/sseRules.js` · token ผ่าน
    query string (EventSource ใส่ Authorization header ไม่ได้ — ยอมรับได้เพราะช่องนี้ส่งสัญญาณเปล่า)
    แต่ด่านตรวจตอนต่อเข้มเท่า `verifyAuth` (เช็ค canLogin ไม่ใช่แค่ลายเซ็น token) · `broadcast()`
    หลังเขียนฐานสำเร็จเท่านั้น ทุก controller (รวมจุดที่ reference ไม่ยิง: `updateUserRole`)
  - **rate limit** — ตัวเลขตาม reference เป๊ะ: login/reset นับเฉพาะครั้งพลาด 15/15นาที
    (ทั้งออฟฟิศออก IP เดียวกัน (NAT) คนล็อกอินถูกไม่โดนลูกหลง) · forgot 6/ชม. · register 10/ชม. ·
    จงใจไม่ใส่ `trust proxy` ของ reference (ผูกกับเรื่อง deploy ที่พักไว้)
  - **role Viewer** — VALID_ROLES + fallback ของ `normalizeRole` เปลี่ยนเป็น Viewer
    (least privilege) · สมัครใหม่ role=Viewer · เพิ่มการ์ด role ที่ `POST /transactions/request`
    + `PUT /transactions/:id/cancel` (products/users การ์ดครบอยู่แล้ว)
  - **คิวรอส่งมอบ** — migration `20260710131952` + backfill `COALESCE(resolved_at, doc_date)`
    (แก้ข้อความ DATABASE.md ข้อ 6.14 ที่เขียน `updated_at` ผิดแล้ว) · endpoint
    `PUT /transactions/:id/pickup` (Admin/Manager · updateMany เงื่อนไข NULL กันกดพร้อมกัน) ·
    `pickedUpAt` เพิ่มในทรง JSON ของล่าม · เงื่อนไขกด = `canMarkPickedUp` (pure + เทสต์)
  - **session เดี่ยว** — migration `20260710132934` + claim `sid` ใน token · เข้มกว่า reference
    ตามข้อ 6.15: token ไม่มี `sid` = ตายทันที (reference ยอมให้ผ่านตอน session_id ยัง NULL) ·
    กติกา = `authRules.checkSession` (pure + เทสต์) ด่านครอบทั้ง verifyAuth และ SSE ·
    updateProfile ออก token ใหม่พก `sid` เดิมแล้ว · sid ไม่ตรง → 401 `code: SESSION_REPLACED`
  - **Web Push** — migration `20260710193403` ตาราง `push_subscriptions` (`user_id` FK
    ตามข้อ 6.16 · endpoint ตาย 410/404 ลบจริง = ข้อยกเว้น soft delete ที่ตั้งใจ) · `push.js`
    ฉบับ Prisma + `routes/pushRoutes.js` · กติกาแยกเทสต์ `utils/pushRules.js` (ป้ายผลจากตัวเลขจริง
    + เกณฑ์อุปกรณ์ตาย) · VAPID สร้างชุดใหม่ลง `.env` แล้ว + `.env.example` มีช่องครบ · push จุดเดียว
    ตอน resolve แจ้งผลผู้ขอ แบบไม่ await (ช้า/ล่มไม่กระทบ response) — ใบใหม่เข้าใช้กระดิ่ง SSE พอ ·
    ⚠️ เจอกับดัก generate ซ้ำ: `migrate dev` รอบนี้ไม่ generate client ให้ ต้อง `npx prisma generate` เอง

## 11 ก.ค. 2026 — เฟส 3 ยกหน้าบ้านทั้งชุด (3A/3B/3C) + เฟส 4 ตรวจรวม

หน้าบ้านใช้วิธี **copy จาก reference แล้ว audit ทีละไฟล์** (ต่างจาก `server/` ที่ห้าม copy —
หน้าบ้านผูกแค่ทรง JSON ซึ่งล่ามคงไว้แล้ว · จุดเชื่อมตรวจแล้วตรงกันหมด: ชื่อ event SSE ทั้ง 3 ·
payload `{subscription}`+public-key ของ push · endpoint pickup+`pickedUpAt` · code
`SESSION_REPLACED`) · ขนาดงานจริง: 23 ไฟล์ +1,563/−424 บรรทัด · เทสต์หน้าบ้าน: ไม่เพิ่ม
framework ใหม่ — ตรวจของจริงใน browser ทุกก้อนก่อน commit + `node --test` เฉพาะ util JS ล้วน

- **3A ฐานร่วม+real-time (5 commits):** deps (เพิ่ม `html5-qrcode`, `jspdf-autotable` ·
  ถอน `html-to-image` ที่ grep แล้วไม่มีใครใช้) · utils ทั้งชุด (api ดัก SESSION_REPLACED /
  events / push / labels / confirm / device / thaiFont) + เทสต์เบา `src/utils/labels.test.js` ·
  index.css · App + Navbar (กระดิ่ง SSE — พิสูจน์จริง broadcast→browser ~30ms) + Login +
  ResetPassword · Skeleton + WelcomeTips · vite.config `host:true` + `src/.env` (เปิดจาก
  มือถือวง LAN — ดู layout ได้ แต่กล้อง/SW/push ต้องการ secure context จึงทดสอบเต็มที่ได้
  เฉพาะ localhost บนคอม) — ข้อค้นพบ:
  - Navbar ส่ง `?view=active`/`?since=` แต่ล่ามยังไม่รองรับ query — คืนทั้งหมดเสมอ
    (ถูกต้องแค่เปลือง bandwidth) → มอบให้ 3B เพิ่ม query support ที่ล่าม
  - แก้ค่า `@plugin "daisyui/theme"` ใน index.css แล้ว HMR ไม่พอ ต้อง restart Vite
    (plugin อ่าน config แค่ตอนบูต — ธีมไม่เปลี่ยนทั้งที่ log ขึ้น hmr update ·
    12 ก.ค.: จดเป็น comment ใน `src/index.css` แล้ว)
  - `src/.env` โดน `.gitignore` (`**/.env`) จึงใช้ `src/.env.example` เข้า git — อนึ่ง Vite
    ไม่อ่าน env จาก `src/` อยู่แล้ว (อ่านจาก root เท่านั้น) ไฟล์นี้เป็นเอกสารบอกช่องคอนฟิก
  - ทิป Admin ใน WelcomeTips ตัดคำว่านำเข้า CSV ออก (bulk import ของเราพักอยู่)
- **3B หน้าหลัก 4 หน้า+สแกนเนอร์ (8 commits):** เตรียม server 4 ก้อนก่อน
  (S1 `getTransactions` รับ `?view=active|dashboard`/`?since`/`?until` ผ่าน pure function
  `transactionRules.buildTransactionWhere` + ถอด `visibleTo` — เปลี่ยนนโยบายเป็นทุก role
  เห็นทุกใบตาม reference บันทึกเหตุผล DATABASE.md ข้อ 6.17 · S2 เพิ่ม `groupId`/`groupName`
  ในทรง item ของ transactions · S3 เพิ่ม `isActive`/`groupId` ใน products + query `?group=` ·
  S4 endpoint ใหม่ `PUT /products/:id/restore` Admin เท่านั้น) แล้ว copy หน้าบ้านทับทีละไฟล์
  (F1 BarcodeScanner+Inventory · F2 Products audit หนักสุด 7 จุด (minStock ทุกจุดว่าง=null
  รวมกับดักตัวที่ 7 ที่ `submitProduct` เดิมใช้ `|| 0`, ตัดช่อง SKU พิมพ์เอง, ล็อกฟอร์ม inbound,
  ตัดปุ่มนำเข้า CSV/ลบถาวร, badge/filter อิง `item.status` แทนเทียบ stock ดิบ, `canArchive`
  เหลือ Admin เท่านั้น) · F3 Homepage (คิวรอส่งมอบ+PDF ไทย copy ตรงตัว เพราะจุดเชื่อมตรงล่าม
  ที่เตรียมจาก S1/S2 พอดี) · F4 UserManagement (แก้ถ้อยคำ confirm ลบให้ตรงความจริง soft delete))
  ยืนยันทุกก้อนด้วยการคลิกจริงใน browser (สร้าง/แก้ไข/รับเข้า/archive-restore/อนุมัติ/ปฏิเสธ/
  ส่งมอบ/export PDF/ส่งใบเบิกจากตะกร้า) — ข้อค้นพบ:
  - ⚠️ เครื่องมือ browser ของ agent (`computer`/`read_page`) ในสภาพแวดล้อมนี้ไม่เสถียร —
    screenshot timeout บ่อย, DOM tree บางครั้งไม่สะท้อนสถานะหลังคลิก (โดยเฉพาะ modal/floating
    button ที่ render ทีหลัง) วิธีแก้ที่ได้ผล: ใช้ `javascript_tool` ยิง
    `dispatchEvent(new MouseEvent('click',{bubbles:true}))` + `Object.getOwnPropertyDescriptor(...).set`
    สำหรับ input ที่ React ควบคุม แล้วอ่านผลด้วย `document.body.innerText`/`fetch` ใน exec เดียวกัน
    (แยก exec คนละก้อนบางทีจับสถานะไม่ทัน)
  - `?view=active` ที่ Navbar ใช้มาตั้งแต่ 3A ทำงานถูกต้องทันทีหลัง S1 — payload จาก 8 ใบ
    เหลือ 1 ใบที่ยังค้างจริง ไม่ต้องแตะหน้าบ้านเลย (พิสูจน์ด้วย Network tab)
  - ตัวกรอง "เฉพาะสต็อกต่ำ" เดิมต้องมีคำค้นถึงเจอของนอก 500 ตัวแรก → แก้แล้ววันเดียวกัน:
    ย้ายการกรองไปฝั่ง server — `getProducts` รับ `?lowStock=true` ใช้ `listLowStockIds`
    (กติกาเดียวกับเลขการ์ด dashboard — `countLowStock` = `.length` ของมัน) สแกนเฉพาะตัวที่ตั้ง
    `min_stock` แล้ว + groupBy กรองผ่าน relation กัน P2029 · ข้อจำกัด `limit=500` ของรายการปกติยังอยู่
  - ฐานพัฒนามีข้อมูลทดสอบตกค้าง (สินค้า `01262` "ทดสอบสินค้า F2" minStock=10, ใบเบิกทดสอบหลายใบ)
    — ไม่กระทบอะไร ลบทิ้งหรือปล่อยไว้ก็ได้
  - สิทธิ์ archive/restore สินค้าจงใจต่างจาก reference (Admin+Manager) → เหลือ Admin เท่านั้น
    ตามของเดิม (ยกเป็นกฎถาวรใน CLAUDE.md ข้อ 4 แล้ว — 12 ก.ค.)
- **3C ชุด PWA+Push:** copy `public/` ทั้งชุดจาก reference (icon-192/512/maskable-512/
  apple-touch-icon.png ตัวจริง + `manifest.webmanifest` + `sw.js` — cache ข้าม `/api/` ทั้งหมด
  ตามที่ตั้งใจ) · `index.html` เปลี่ยน `lang="th"` + meta PWA · `main.jsx` ลงทะเบียน SW หลัง
  `window.load` · `InstallPrompt` copy ตรงตัว (banner `beforeinstallprompt`, iOS ไม่มี event นี้
  ตามที่คอมเมนต์ในโค้ดบอก ถือว่าถูกแล้ว) · commit 2 = `Settings` copy ทั้งไฟล์จาก reference
  (เดิมสไตล์เก่า/label อังกฤษ — รอบนี้ได้ glass-panel + label ไทย + ส่วน "🔔 การแจ้งเตือน") ·
  ยืนยันด้วย browser จริง: manifest fetch 200 ทุก field ตรง, SW register+activate สำเร็จ,
  ไอคอนทั้ง 4 ไฟล์ fetch 200, หน้า Settings render ส่วนแจ้งเตือนถูกกิ่ง (`Notification.permission`
  ในเบราว์เซอร์ทดสอบเป็น `denied` → เห็นข้อความบล็อกตามที่โค้ดควรทำ ไม่ใช่บั๊ก) · `npm test`
  ฝั่ง server ผ่านครบ 89 ตัว ณ ตอนจบเฟส (เซสชันนี้ไม่แตะ server)
- **เฟส 4 ตรวจรวม:** เจาะ mutation flow แบบ end-to-end แทนคลิกทุกหน้าซ้ำ (คำแนะนำที่ปรึกษา:
  เฟส 4 คือพิสูจน์ว่า "ชิ้นส่วนทำงานร่วมกัน" ไม่ใช่ re-render แต่ละหน้าซ้ำ): สมัครสมาชิกใหม่
  (`testphase4`) → role เริ่ม Viewer → admin อนุมัติ+เลื่อนเป็น Operator → login คนละ tab →
  เพิ่มสินค้าลงตะกร้า+ส่งใบเบิก → SSE cross-tab ยืนยันจริง: ใบใหม่โผล่ในคิว "รออนุมัติ" ของ
  tab admin ทันทีโดยไม่ reload → ปฏิเสธทั้งใบ (resolved_by≠requested_by → ป้าย "ปฏิเสธ" ถูก) →
  กด "รับของแล้ว" ปิดคิวส่งมอบใบเก่า · ระหว่างทางพิสูจน์ session เดี่ยวโดยไม่ตั้งใจ: login admin
  ซ้ำจาก tab สอง เตะ tab แรกกลับหน้า login (SESSION_REPLACED ตามออกแบบ) · Push ตรวจได้แค่ UI —
  `Notification.permission='denied'` เป็นข้อจำกัด sandbox ของเบราว์เซอร์ทดสอบ **delivery จริง
  ยังพิสูจน์ไม่ได้** (ยกเป็น backlog ใน CLAUDE.md แล้ว — 12 ก.ค.) · เซสชันนี้ใช้ browser-side
  evidence (DOM/network/localStorage) ตลอดเพราะ server เป็นของ session อื่นที่เปิดค้างไว้
- **แผน wms-ics-reference จบครบทุกเฟส** (ส่วน "เสิร์ฟ dist/ จาก Express + tunnel" ที่ reference
  มี = เรื่อง deploy → พักไว้ตามข้อ 0 ของ CLAUDE.md)

## 12 ก.ค. 2026 — แผนปรับปรุงตามผลวิเคราะห์ภายนอก

ผลวิเคราะห์จากภายนอกชี้จุดอ่อน 6 ข้อ ตรวจสอบกับโค้ดจริงแล้วถูกทั้งหมด → ทำตามลำดับคุ้ม/เสี่ยง:

- **แก้ช่องโหว่ SKU ซ้ำเบิกเกินสต็อก** (`a915da2`) — `aggregateOutboundItems` รวมบรรทัดก่อนตรวจ
  (pure function ใน `transactionRules.js` + เทสต์ 2 ตัว) · พิสูจน์ end-to-end ผ่าน API จริง:
  เคสเกินสต็อกได้ 400, เคสซ้ำที่รวมแล้วพอสร้างใบเป็นบรรทัดเดียว (ยกเป็นกฎถาวร CLAUDE.md ข้อ 4)
- **เก็บกวาดเอกสาร+lint** (`c0be820`) — README เลิกพูดถึง `db.js` ที่ลบแล้ว + เพิ่มหมวด
  ตรวจคุณภาพ · eslint ignore `server/generated/**` (เดิม `npm run lint` ล้ม 196 errors
  เพราะตรวจโค้ด generate)
- **แยก `server/app.js` ออกจาก listen** (`c3fd0f3`) — เปิดทางให้ supertest · บทเรียนตรวจรับ:
  smoke test ผ่าน browser ตอนมี server เก่าค้างพอร์ต 5000 = พิสูจน์โค้ดผิดตัว (Vite proxy
  hardcode 5000) → ต้องยิง API ตรงใส่พอร์ตของโค้ดใหม่
- **integration tests 12 flow** (`52158f2`) — supertest devDep ฝั่ง server ตัวเดียว +
  `server/test/integration/` 3 ไฟล์ (auth 4 / products 3 / transactions 5) · กับดักทั้งหมด
  จดไว้ที่ `server/test/integration/README.md` · `npm test` = 112 ตัว (99 unit + 12 integration
  + 1 helper module ที่ node --test นับเป็น 1 pass)
- **อัปเดต CLAUDE.md บันทึกบทเรียน** (`1c8cc1f`)
- `npm audit` ฝั่ง server ณ 12 ก.ค. 2026: moderate 3 รายการ — ยังไม่ได้วางแผนแก้
  (ถ้าจะทำให้ตั้งเป็นงานใน backlog ก่อน)
- **จัดบ้านเอกสาร:** แยกประวัติ/บันทึกเซสชันออกจาก CLAUDE.md มาไว้ไฟล์นี้ · กับดัก integration
  tests ย้ายไป README ข้างโค้ด · กับดัก daisyui theme ย้ายเป็น comment ใน `src/index.css` ·
  กฎถาวรที่เคยฝังในประวัติ 6 ข้อถูกยกขึ้น CLAUDE.md ข้อ 3–4 (P2029 · SKU ซ้ำต้องรวมก่อนตรวจ ·
  ห้าม clamp เงียบ · ตัด auto-create ใน inbound · ทุก role อ่านได้ทุกใบแต่สิทธิ์ดำเนินการตาม
  role เดิม · archive/restore = Admin เท่านั้น)

## 12 ก.ค. 2026 — ฟีเจอร์ QR: parser + สแกนป้ายเดิมเข้าหน้า Products

งานใหม่นอกแผน reference · ทำแบบ **review-driven** (เขียน→ผู้ตรวจอิสระ→แก้→ตรวจซ้ำ) ทุกชิ้น

- **parser `parseWarehouseQr`** (`d6b0d00`, `src/utils/qr.js` + เทสต์) — อ่านป้าย 9 หลัก `MMYY+item_id`
  ตาม `Newdatabase/docs/qr_spec.md` · คงทุกอย่างเป็น string (เลขศูนย์นำหน้าห้ามหาย) ·
  itemId = 5 หลักท้ายเป็นคีย์จริง MMYY เป็นข้อมูลประกอบ ห้ามใช้รหัสเต็มเป็น key · แยก error
  "รูปแบบผิด" กับ "เดือนนอกช่วง 01–12" · **บทเรียนจากรีวิว 2 รอบ:** เทสต์ `f(x)===f(x)` เป็น
  tautology (ผ่านเพราะ deterministic ไม่พิสูจน์ค่า) → เปลี่ยนเป็นเทียบ expected object · เพิ่ม
  boundary เดือน 01/12 ฝั่ง valid (mutation `>12`→`>=12` / `<1`→`<=1` จะหลุดถ้าไม่มี)
- **เชื่อมเข้า Products** (`ccd635b`) — `src/utils/productQrScan.js` (pure) + hook
  `src/components/Products/useProductQrScan.js` แยกวงจรสแกนออกจาก `index.jsx` (component โตอยู่แล้ว) ·
  รองรับกล้องมือถือ + เครื่องสแกนคีย์บอร์ดทั้งส่ง/ไม่ส่ง Enter (debounce 180ms รอรับรหัสครบ
  ก่อน parse — กันรับ 9 ตัวแรกของรหัสที่ยาวเกิน) · บาร์โค้ด item_id 5 หลักยังสแกนได้เหมือนเดิม ·
  ล้าง group/low-stock filter ที่อาจบังผล แต่**คง showInactive ตามเจตนา** · รหัสผิดคืนคำค้นเดิม
  ไม่เขียนทับ · ไม่พบสินค้าแจ้งเตือน ห้าม auto-create
  - **หัวใจกัน race — `classifyScanResponse` (pure):** ผล fetch จากรอบสแกนเก่า/บริบทที่เปลี่ยนไปแล้ว
    ต้องไม่แจ้งผลย้อนหลัง · ใช้ `scanVersion` (นับขึ้นทุกครั้งที่สแกน · fetch closure ถือ version
    ของตัวเอง) + เทียบคำค้น/filter ปัจจุบัน → คืน `current`/`ignore`/`cancelled` · จุดละเอียด:
    `ignore` ต้อง **ไม่** เคลียร์ pending (ปล่อยให้ response รอบจริงจัดการต่อ) ส่วน `cancelled`
    เคลียร์แล้วเงียบ · แยกออกเป็น pure function เพื่อ unit-test ได้ (guard เดิมฝังใน hook เทสต์ไม่ได้)
  - **จากรีวิว:** รอบแรกพบ "โหมด keyboard-armed ไม่มีทางยกเลิก" (พิมพ์มือค้างตอน armed →
    ช่องถูกล้าง+เด้ง error) → เพิ่มยกเลิกด้วย Esc/blur (`cancelArmedScan`: clear timer+disarm+
    คืนคำค้นเดิม · guard `if(!scanArmed)` กันไม่ให้ blur ทับคำค้นของสแกนที่สำเร็จไปแล้ว) ·
    ยังเหลือ **ข้อควรระวังรอทดสอบเครื่องจริง:** เครื่องที่ยิงเลขแล้วตามด้วย **Tab** (ย้ายโฟกัส)
    จะโดน onBlur ยกเลิกก่อน timer 180ms ยิง — สอง config ที่รองรับ (Enter / ไม่มี suffix) ไม่กระทบ
  - **สมมติฐานที่ล็อกไว้:** `hasExactScannedProduct` ยืนยันพบสินค้าด้วย `product.sku === itemId`
    (API ส่ง item_id ผ่านฟิลด์ `sku` เป็น string 5 หลักตรงตัว) — เพราะ API ค้นแบบ contains
    การแจ้ง "พบสินค้า" ต้องเช็คตรงตัวเอง ไม่งั้น `1504` จะเคลม `15041`
- **สถานะ:** `npm test` 128 ผ่าน · lint/build ผ่าน · verdict รีวิว = พร้อมให้ผู้ใช้ทดสอบ ·
  เหลือ "พิมพ์ป้าย QR" + ใช้ parser เดียวกันใน Inventory (ยังสแกน raw code เดิม) — ดู backlog CLAUDE.md ข้อ 6
- **ขอบเขตที่ไม่แตะ:** `Newdatabase/docs/qr_spec.md` มีงานแก้ของเจ้าของค้างอยู่ (unstaged) — เว้นไว้
  ตลอดทั้งงานนี้ ไม่รวมในทุก commit
