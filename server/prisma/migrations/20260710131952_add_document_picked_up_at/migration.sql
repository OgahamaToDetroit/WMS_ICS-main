-- AlterTable
ALTER TABLE "stock_documents" ADD COLUMN "picked_up_at" DATETIME;

-- Backfill (DATABASE.md ข้อ 6.14): ใบ ISSUE ที่ CONFIRMED อยู่ก่อนมีฟีเจอร์นี้ ถือว่าส่งมอบไปแล้ว
-- ไม่งั้นใบประวัติศาสตร์ทั้งหมดจะท่วมคิวรอส่งมอบทันทีที่เปิดหน้าจอ (บทเรียนเดียวกับที่ reference เจอ)
-- ใช้ resolved_at (เวลาปิดใบ) เป็นเวลาส่งมอบโดยประมาณ · COALESCE ไป doc_date กันแถวเก่าที่ resolved_at ว่าง
UPDATE "stock_documents"
SET "picked_up_at" = COALESCE("resolved_at", "doc_date")
WHERE "doc_type" = 'ISSUE' AND "status" = 'CONFIRMED' AND "picked_up_at" IS NULL;
