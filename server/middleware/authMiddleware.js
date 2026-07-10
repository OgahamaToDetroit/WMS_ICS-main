import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { getUserById } from '../data/userManager.js';
import { canLogin, checkSession } from '../utils/authRules.js';

export const verifyAuth = async (req, res, next) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'ไม่อนุญาตให้เข้าถึง (ไม่มี Token)' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    const user = await getUserById(decoded.id);

    // เช็คซ้ำทุกคำขอด้วยเงื่อนไขสองแกน (status=Active และ is_active=true) — token อาจออกก่อนถูกปลดระวาง
    if (!canLogin(user)) {
      return res.status(403).json({ success: false, message: 'บัญชีนี้ไม่พร้อมใช้งาน' });
    }

    // 1 บัญชี = 1 อุปกรณ์ (ข้อ 6.15): sid ใน token ต้องตรงกับ session ล่าสุดใน database
    const session = checkSession(decoded.sid, user.session_id);
    if (session === 'MISSING_SID') {
      // token รุ่นก่อนมีฟีเจอร์ session — ถือว่าใช้ไม่ได้ ให้ login ใหม่ (ข้อความเดียวกับ token เสีย)
      return res.status(403).json({ success: false, message: 'Token ไม่ถูกต้องหรือหมดอายุแล้ว' });
    }
    if (session === 'REPLACED') {
      return res.status(401).json({
        success: false,
        code: 'SESSION_REPLACED', // หน้าเว็บ (เฟส 3) ใช้ code นี้แยกเคส "โดนเครื่องอื่นเตะ" จาก token หมดอายุปกติ
        message: 'บัญชีนี้ถูกเข้าสู่ระบบจากอุปกรณ์อื่น กรุณาเข้าสู่ระบบใหม่'
      });
    }

    // ⚠️ คงรูป {id, username, role} เป๊ะ — เส้น transactions (ยังไม่ย้าย) พึ่ง req.user.username หนัก
    req.user = { id: user.id, username: user.username, role: user.role };
    next();
  } catch {
    return res.status(403).json({ success: false, message: 'Token ไม่ถูกต้องหรือหมดอายุแล้ว' });
  }
};

export const authorizeRoles = (...allowedRoles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบก่อน' });
  }

  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'สิทธิ์ของคุณไม่สามารถทำรายการนี้ได้' });
  }

  next();
};
