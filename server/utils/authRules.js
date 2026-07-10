// กติกาเส้น auth ที่ database บังคับเองไม่ได้ (SQLite ไม่มี enum/เงื่อนไขซับซ้อน) —
// แยกเป็น pure function เพื่อให้เทสต์ด้วย node --test ได้โดยไม่ต้องต่อ database
// (แนวเดียวกับ utils/productRules.js ที่เส้น products วางไว้)
// ที่มาของแต่ละกติกา: DATABASE.md ข้อ 6 (ข้อ 2, 5, 6, 7) + Newdatabase/docs/data_dictionary.md

// enum จำลอง — SQLite ไม่มี enum จริง โค้ดต้องกันค่านอกชุดเอง (DATABASE.md ข้อ 6.2)
// Viewer เพิ่ม 10 ก.ค. 2026 (ข้อ 6.13): ดูข้อมูลได้ทุกหน้า แต่สร้างใบเบิก/แก้ไขอะไรไม่ได้
export const VALID_ROLES = ['Admin', 'Manager', 'Operator', 'Viewer'];
export const VALID_STATUSES = ['Pending', 'Active', 'Denied'];

// ค่านอกชุดดันกลับสิทธิ์ "ต่ำสุด" (least privilege — ข้อ 6.13): ค่าที่เดาไม่ออก
// ต้องไม่กลายเป็นสิทธิ์ที่เบิกของได้เงียบๆ (fallback เดิมเป็น Operator ตอนยังไม่มี Viewer)
export const normalizeRole = (role) => (VALID_ROLES.includes(role) ? role : 'Viewer');
export const normalizeStatus = (status) => (VALID_STATUSES.includes(status) ? status : 'Pending');

// ---------------------------------------------------------------------------
// เงื่อนไข login สองแกน (DATABASE.md ข้อ 6.5): login ได้ต้อง status=Active "และ" is_active=true
// สองแกนคนละหน้าที่: status = วงจรอนุมัติบัญชี (สมัคร→รอ→อนุมัติ) · is_active = ปลดระวาง (soft delete)
// ---------------------------------------------------------------------------
export const canLogin = (user) =>
  !!user && user.status === 'Active' && user.is_active === true;

// ข้อความปฏิเสธ login แยกตามเหตุผล — คืน null ถ้าเข้าได้ (ข้อความ Pending/Denied คงเดิมของระบบเก่า)
export const loginRejectionMessage = (user) => {
  if (!user) return 'Username หรือ Password ไม่ถูกต้อง';
  if (user.status === 'Pending') return 'บัญชีรอผลการอนุมัติ';
  if (user.status === 'Denied') return 'บัญชีนี้ไม่ได้รับอนุมัติให้ใช้งานระบบ';
  if (!user.is_active) return 'บัญชีนี้ถูกระงับการใช้งาน';
  if (user.status !== 'Active') return 'บัญชีนี้ไม่พร้อมใช้งาน';
  return null;
};

// ---------------------------------------------------------------------------
// ฝั่งแสดงผล (แถว users ฐานใหม่ → JSON ทรงเดิมของหน้า React) — บทบาท "ล่าม"
// ---------------------------------------------------------------------------

// รูป avatar: ถ้าไม่มี (NULL/ว่าง) generate จากชื่อผู้ใช้ — แบบเดียวกับ safeUser เดิมเป๊ะ
export const avatarForUser = (user) =>
  user.avatarUrl ||
  `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username)}&background=0D8ABC&color=fff`;

// ทรงผู้ใช้ที่หน้า login/verify-token คาดหวัง: มี status + avatarUrl ผ่าน fallback (ไม่มีวันว่าง)
// ⚠️ อย่าเอาไปใช้กับ getUsersList (ต้องการ avatarUrl ดิบ) หรือ updateProfile (ไม่มี status) —
//    สามที่ทรงต่างกัน โจทย์บังคับให้เหมือนเดิมเป๊ะ (ห้ามยุบรวม)
export const toAuthUser = (user) => ({
  id: user.id,
  username: user.username,
  email: user.email,
  role: user.role,
  status: user.status,
  avatarUrl: avatarForUser(user)
});

// ---------------------------------------------------------------------------
// โทเคนลืมรหัสผ่าน (DATABASE.md ข้อ 6.6): ใช้ครั้งเดียว + มีวันหมดอายุ
// database เก็บ hash ของโทเคน — เงื่อนไข "ใช้ได้ไหม" database บังคับเองไม่ได้ โค้ดคุมเอง
// ---------------------------------------------------------------------------
export const isResetTokenUsable = (token, now = new Date()) => {
  if (!token) return false;
  if (token.used_at) return false; // ใช้ไปแล้ว = ใช้ซ้ำไม่ได้
  const expiresMs = token.expires_at instanceof Date
    ? token.expires_at.getTime()
    : new Date(token.expires_at).getTime();
  return expiresMs > now.getTime();
};
