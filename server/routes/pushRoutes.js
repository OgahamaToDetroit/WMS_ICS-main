import express from 'express';
import { verifyAuth } from '../middleware/authMiddleware.js';
import { getPublicKey, isPushEnabled, saveSubscription } from '../push.js';

const router = express.Router();

// หน้าเว็บดึง VAPID public key ไปสมัคร push กับ browser — key ไม่ตั้ง = enabled:false หน้าเว็บข้ามฟีเจอร์เอง
router.get('/push/public-key', verifyAuth, (req, res) => {
  res.json({ success: true, enabled: isPushEnabled(), publicKey: getPublicKey() });
});

// เก็บ subscription ของอุปกรณ์นี้ ผูกกับคนที่ login อยู่ (req.user.id เท่านั้น — ห้ามรับ user จาก body
// ไม่งั้นใครก็สมัครรับแจ้งเตือนแทนคนอื่นได้) · ทุก role สมัครได้รวม Viewer (แจ้งเตือนของตัวเองล้วนๆ)
router.post('/push/subscribe', verifyAuth, async (req, res) => {
  try {
    await saveSubscription(req.user.id, req.body.subscription);
    res.json({ success: true });
  } catch (err) {
    console.error('push subscribe error:', err);
    res.status(500).json({ success: false });
  }
});

export default router;
