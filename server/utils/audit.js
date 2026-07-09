// บันทึก audit ลง database ใหม่ (ตาราง audit_logs, Prisma model AuditLog) —
// ต่างจาก db.js logAudit เดิมตรงอ้างผู้กระทำด้วย actor_id (FK → users.id) ไม่ใช่ username เป็นข้อความ
// (DATABASE.md ข้อ 6.7 — id ปลอมไม่ได้/ค้างไม่ได้ ต่างจากข้อความ)
//
// ตั้งใจแยกจาก db.js: เส้น transactions ยังใช้ logAudit เก่า (actor_username) จนกว่าจะย้ายตาม —
// ถ้าไปแก้ signature เดิมจะพังทั้งเส้น transactions ทันที
import { prisma } from '../prisma.js';

export const logAudit = async (actorId, action, entityType, entityId, details = {}) =>
  prisma.auditLog.create({
    data: {
      actor_id: actorId == null ? null : Number(actorId), // NULL = ไม่รู้ผู้กระทำ (เหตุการณ์ก่อน login สำเร็จ)
      action,
      entity_type: entityType ?? null,
      entity_id: entityId == null ? null : String(entityId), // entity_id เป็น text เสมอ (item_id เป็น text)
      details: JSON.stringify(details ?? {})
    }
  });

// best-effort — audit ล้มไม่ควรทำให้คำขอหลักล้มตาม (แนวเดียวกับ tryLogAudit เดิมของ productController)
export const tryLogAudit = async (...args) => {
  try {
    await logAudit(...args);
  } catch (error) {
    console.error('logAudit (ฐานใหม่) ล้มเหลว:', error);
  }
};
