// data layer ของเส้น auth — ย้ายมาใช้ database ใหม่ (Prisma model User) แล้ว
// เป็นชั้น query ล้วน (async): controller/middleware ใช้ร่วมกัน 3 ที่ กติกาที่ database
// บังคับเองไม่ได้อยู่ที่ utils/authRules.js (แยกไว้เทสต์ได้) — แนวเดียวกับเส้น products
//
// ต่างจากฐานเก่า (app_users): คอลัมน์ password → password_hash, เพิ่ม name (NOT NULL) + is_active
// ⚠️ ไม่ seed admin ตอน import อีกต่อไป — ฐานใหม่ห้ามมีปุ่ม "ล้างแล้วเติมข้อมูล" ใกล้มือ
//    admin คนแรกสร้างผ่าน `npm run create-admin` เท่านั้น (DATABASE.md ข้อ 4 + prisma.config ตั้งใจไม่มี seed)
import { prisma } from '../prisma.js';
import { normalizeRole, normalizeStatus } from '../utils/authRules.js';

// ---------------------------------------------------------------------------
// อ่าน (finders)
// ---------------------------------------------------------------------------

export const getUserById = async (id) => {
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) return null;
  return prisma.user.findUnique({ where: { id: numericId } });
};

// username: match แบบไม่สนตัวพิมพ์ (รักษาพฤติกรรมฐานเก่าที่ใช้ LOWER() สองฝั่ง)
// Prisma บน SQLite ไม่รองรับ mode:'insensitive' — ใช้ raw หา id ก่อนแล้วค่อย findUnique
// (LOWER ของ SQLite ครอบเฉพาะ ASCII เท่ากับพฤติกรรมเดิมเป๊ะ · ชื่อภาษาไทยไม่ได้รับผลทั้งสองทาง)
export const getUserByUsername = async (username) => {
  const value = String(username || '').trim();
  if (!value) return null;
  const rows = await prisma.$queryRaw`SELECT id FROM users WHERE LOWER(username) = LOWER(${value}) LIMIT 1`;
  if (!rows.length) return null;
  return prisma.user.findUnique({ where: { id: Number(rows[0].id) } });
};

// email เก็บเป็น lowercase เสมอ (createUser/updateUser บังคับ) → findUnique ตรงๆ ก็ไม่สนตัวพิมพ์อยู่แล้ว
export const getUserByEmail = async (email) => {
  const value = String(email || '').trim().toLowerCase();
  if (!value) return null;
  return prisma.user.findUnique({ where: { email: value } });
};

// รายชื่อสำหรับหน้าจัดการผู้ใช้ — โชว์เฉพาะที่ยังใช้งานอยู่ (soft delete แล้วซ่อนจากตาราง)
export const getUsers = async () =>
  prisma.user.findMany({ where: { is_active: true }, orderBy: { username: 'asc' } });

// นับ Admin ที่ใช้งานได้จริง (ทั้งอนุมัติแล้ว + ยังไม่ปลดระวาง) — กันเผลอลด Admin คนสุดท้าย
export const countActiveAdmins = async () =>
  prisma.user.count({ where: { role: 'Admin', status: 'Active', is_active: true } });

// ---------------------------------------------------------------------------
// เขียน
// ---------------------------------------------------------------------------

// สมัคร/สร้างผู้ใช้ — name (NOT NULL) default = username แก้ทีหลังได้ · เก็บแต่ password_hash
export const createUser = async ({
  username,
  email,
  password_hash,
  name,
  role = 'Operator',
  status = 'Pending',
  avatarUrl = null
}) => {
  const trimmedUsername = String(username || '').trim();
  return prisma.user.create({
    data: {
      name: String(name || trimmedUsername).trim() || trimmedUsername,
      username: trimmedUsername,
      email: String(email || '').trim().toLowerCase(),
      password_hash,
      role: normalizeRole(role),
      status: normalizeStatus(status),
      avatarUrl: avatarUrl == null ? null : String(avatarUrl)
    }
  });
};

// แก้เฉพาะ field ที่ส่งมาจริง (undefined = ไม่แตะ) — กันเสก default ทับค่าที่ไม่ได้ตั้งใจแก้
export const updateUser = async (id, fields = {}) => {
  const numericId = Number(id);
  const data = {};

  if (fields.username !== undefined) data.username = String(fields.username).trim();
  if (fields.email !== undefined) data.email = String(fields.email).trim().toLowerCase();
  if (fields.password_hash !== undefined) data.password_hash = fields.password_hash;
  if (fields.role !== undefined) data.role = normalizeRole(fields.role);
  if (fields.status !== undefined) data.status = normalizeStatus(fields.status);
  if (fields.avatarUrl !== undefined) data.avatarUrl = fields.avatarUrl == null ? null : String(fields.avatarUrl);
  if (fields.is_active !== undefined) data.is_active = Boolean(fields.is_active);

  if (Object.keys(data).length === 0) return getUserById(numericId);
  return prisma.user.update({ where: { id: numericId }, data });
};

// 1 บัญชี = 1 อุปกรณ์ (DATABASE.md ข้อ 6.15): เขียนทับเลข session ทุกครั้งที่ login สำเร็จ
// → token ของเครื่องเก่าที่พก sid เดิมจะไม่ตรงค่าล่าสุด ถูกตัดออกที่ authMiddleware/SSE ทันที
export const setSessionId = async (id, sessionId) =>
  prisma.user.update({ where: { id: Number(id) }, data: { session_id: sessionId } });

// ลบ = soft delete เท่านั้น (DATABASE.md ข้อ 5) — FK ทุกเส้นตั้ง ON DELETE RESTRICT
// hard delete ผู้ใช้ที่เคย login/สร้างใบ จะโดน database เตะ (P2003) อยู่แล้ว
// ผลข้างเคียงที่ตั้งใจ: username/email ของแถวนี้ถูกจอง (unique) ต่อไป — สมัครซ้ำชื่อเดิมไม่ได้
export const deactivateUser = async (id) => {
  await prisma.user.update({ where: { id: Number(id) }, data: { is_active: false } });
  return true;
};
