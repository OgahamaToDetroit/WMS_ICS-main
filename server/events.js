// ============================================================================
// SSE (Server-Sent Events) — ช่องทางให้ server "ผลัก" สัญญาณบอก browser ทันทีที่ข้อมูลเปลี่ยน
// (ใบเบิก/สินค้า/ผู้ใช้) แล้ว browser ค่อยไป refetch ผ่าน API ปกติที่มีด่านสิทธิ์คุมอยู่แล้ว
// สัญญาณมีแค่ชื่อ event ไม่มีข้อมูลจริง — ข้อมูลจึงไม่มีทางรั่วผ่านช่องนี้
//
// สเปคตาม wms-ics-reference/server/events.js — ต่างหนึ่งจุดโดยตั้งใจ: ด่านตรวจตอนต่อ
// เช็คถึงระดับบัญชี (canLogin สองแกน) เท่ามาตรฐาน verifyAuth ไม่ใช่แค่ลายเซ็น token
// ============================================================================
import express from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { getUserById } from './data/userManager.js';
import { canLogin, checkSession } from './utils/authRules.js';
import { formatEventMessage } from './utils/sseRules.js';

const clients = new Set();
const router = express.Router();

// EventSource ของ browser ใส่ Authorization header ไม่ได้ (ข้อจำกัดของ API ตัวนี้เอง)
// จึงรับ token ผ่าน query แทน — ยอมรับได้เพราะช่องนี้ส่งแต่สัญญาณเปล่า (เคาะไว้ 10 ก.ค. 2026)
router.get('/events', async (req, res) => {
  const token = String(req.query.token || '');
  if (!token) {
    return res.status(401).json({ success: false, message: 'ไม่อนุญาตให้เข้าถึง (ไม่มี Token)' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, config.jwtSecret);
  } catch {
    return res.status(403).json({ success: false, message: 'Token ไม่ถูกต้องหรือหมดอายุแล้ว' });
  }

  try {
    // เช็คซ้ำถึงระดับบัญชีแบบเดียวกับ verifyAuth — token อาจออกก่อนบัญชีถูกปลดระวาง/ระงับ
    const user = await getUserById(decoded.id);
    if (!canLogin(user)) {
      return res.status(403).json({ success: false, message: 'บัญชีนี้ไม่พร้อมใช้งาน' });
    }
    // 1 บัญชี = 1 อุปกรณ์ (ข้อ 6.15) — ด่านเดียวกับ verifyAuth: เครื่องเก่าห้ามต่อ stream ค้างไว้
    const session = checkSession(decoded.sid, user.session_id);
    if (session === 'MISSING_SID') {
      return res.status(403).json({ success: false, message: 'Token ไม่ถูกต้องหรือหมดอายุแล้ว' });
    }
    if (session === 'REPLACED') {
      return res.status(401).json({
        success: false,
        code: 'SESSION_REPLACED',
        message: 'บัญชีนี้ถูกเข้าสู่ระบบจากอุปกรณ์อื่น กรุณาเข้าสู่ระบบใหม่'
      });
    }
  } catch (err) {
    console.error('[sse] ตรวจบัญชีตอนเปิด stream ไม่สำเร็จ:', err);
    return res.status(500).json({ success: false, message: 'Database error' });
  }

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no' // กัน reverse proxy buffer stream — รันตรงๆ ไม่มีผลอะไร
  });
  res.flushHeaders();
  res.write('retry: 5000\n\n'); // connection หลุดเมื่อไหร่ browser ต่อกลับเองใน 5 วินาที

  clients.add(res);
  // ping เปล่า (comment line ของ SSE) ทุก 25 วิ — กันตัวกลางตัด connection ที่เงียบนานเกิน
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(res);
  });
});

// กระจายสัญญาณให้ทุก client ที่ต่ออยู่ — เรียกหลังงานเขียน database "สำเร็จแล้ว" เท่านั้น
// (ยิงก่อน commit = หน้าเว็บ refetch แล้วเจอข้อมูลเก่า กลายเป็นสัญญาณโกหก)
export const broadcast = (event) => {
  const message = formatEventMessage(event);
  if (!message) {
    // event นอกชุด = โค้ดเราสะกดผิด — เตือนดังๆ แต่ห้าม throw (งานที่สำเร็จแล้วต้องไม่ล้มเพราะสัญญาณ)
    console.warn(`[sse] ไม่รู้จัก event "${event}" — ดูชุดที่ใช้ได้ใน utils/sseRules.js`);
    return;
  }
  for (const client of clients) {
    try {
      client.write(message);
    } catch {
      clients.delete(client);
    }
  }
};

export default router;
