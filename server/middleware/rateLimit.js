// จำกัดจำนวนครั้งการเรียก endpoint อ่อนไหว (login/สมัคร/ลืมรหัสผ่าน) — กันการเดารหัสผ่านรัวๆ
// และกันสแปมอีเมล · ตัวเลขตาม wms-ics-reference/server/middleware/rateLimit.js เป๊ะ (เคาะ 10 ก.ค. 2026)
// จงใจไม่ใส่ trust proxy ของ reference — ของนั้นผูกกับการรันหลัง tunnel (เรื่อง deploy พักไว้ตามข้อ 0)
//
// LIMITS แยกเป็น object เปล่าให้เทสต์พินได้ — จุดที่สำคัญที่สุดคือ skipSuccessfulRequests ของ
// login/reset: นับเฉพาะครั้งที่ "ล้มเหลว" เพราะ rate limit นับต่อ IP ถ้าทั้งออฟฟิศออกเน็ต
// ผ่าน IP เดียวกัน (NAT) แล้วนับทุกครั้ง คนทั้งออฟฟิศจะโดนล็อกพร้อมกันทั้งที่ไม่มีใครเดารหัสเลย
import rateLimit from 'express-rate-limit';

export const LIMITS = {
  login: {
    windowMs: 15 * 60 * 1000,
    max: 15,
    skipSuccessfulRequests: true,
    message: 'พยายามเข้าสู่ระบบผิดหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่'
  },
  resetPassword: {
    windowMs: 15 * 60 * 1000,
    max: 15,
    skipSuccessfulRequests: true,
    message: 'พยายามรีเซ็ตรหัสผ่านบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่'
  },
  // forgot/register นับทุกครั้งไม่ว่าสำเร็จไหม — เป้าหมายคือกันสแปมอีเมล/สมัครรัว ไม่ใช่กันเดารหัส
  forgotPassword: {
    windowMs: 60 * 60 * 1000,
    max: 6,
    message: 'ขอรีเซ็ตรหัสผ่านบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่'
  },
  register: {
    windowMs: 60 * 60 * 1000,
    max: 10,
    message: 'สมัครสมาชิกบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่'
  }
};

const makeLimiter = ({ windowMs, max, message, skipSuccessfulRequests = false }) =>
  rateLimit({
    windowMs,
    max,
    skipSuccessfulRequests,
    standardHeaders: true, // แจ้งโควตาที่เหลือผ่าน header มาตรฐาน RateLimit-*
    legacyHeaders: false, // ไม่ส่ง X-RateLimit-* แบบเก่า (ซ้ำซ้อน)
    message: { success: false, message } // เกินโควตา = 429 ทรง JSON เดียวกับ error อื่นของระบบ
  });

export const loginLimiter = makeLimiter(LIMITS.login);
export const resetPasswordLimiter = makeLimiter(LIMITS.resetPassword);
export const forgotPasswordLimiter = makeLimiter(LIMITS.forgotPassword);
export const registerLimiter = makeLimiter(LIMITS.register);
