import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { getUserById } from '../data/userManager.js';
import { canLogin } from '../utils/authRules.js';

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
