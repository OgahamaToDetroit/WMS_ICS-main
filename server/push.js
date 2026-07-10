// Web Push — แจ้งเตือนที่เด้งถึงอุปกรณ์แม้ปิดแอปอยู่ (ส่งผ่าน push service ของ browser → Service Worker)
// ฉบับฐานใหม่ (DATABASE.md ข้อ 6.16): ตาราง push_subscriptions ผูก user_id FK — ไม่ใช่ username
// แบบ reference (ปรัชญาข้อ 6.7: ข้อความค้าง/ปลอมได้ แต่ id ตรวจย้อนได้เสมอ)
import webpush from 'web-push';
import { prisma } from './prisma.js';
import { config } from './config.js';
import { isDeadSubscription } from './utils/pushRules.js';

// ไม่ตั้ง VAPID keys = ฟีเจอร์ปิดตัวเองพร้อม warn (แบบเดียวกับ email) — ไม่ใช่ error
// VAPID = คู่กุญแจประจำเซิร์ฟเวอร์เรา ใช้ยืนยันกับ push service ว่าใครเป็นคนส่ง
const enabled = !!(config.vapid.publicKey && config.vapid.privateKey);
if (enabled) {
  webpush.setVapidDetails(config.vapid.subject, config.vapid.publicKey, config.vapid.privateKey);
} else {
  console.warn('⚠️ VAPID keys ยังไม่ถูกตั้งค่าใน .env — ปิดฟีเจอร์ push notification');
}

export const isPushEnabled = () => enabled;
export const getPublicKey = () => config.vapid.publicKey;

// บันทึก/อัปเดต subscription — 1 อุปกรณ์ = 1 แถว: endpoint ชนกัน = อัปเดตทับ
// (เครื่องเดิมคนใหม่ login → การแจ้งเตือนของเครื่องย้ายไปหาเจ้าของล่าสุด สอดคล้อง session เดี่ยวข้อ 6.15)
export const saveSubscription = async (userId, subscription) => {
  if (!subscription?.endpoint || !userId) return;
  await prisma.pushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    create: {
      user_id: userId,
      endpoint: subscription.endpoint,
      subscription: JSON.stringify(subscription)
    },
    update: { user_id: userId, subscription: JSON.stringify(subscription) }
  });
};

// ส่ง push ให้ทุกอุปกรณ์ของผู้ใช้คนหนึ่ง — endpoint ที่ตายแล้ว (410/404) ลบแถวทิ้งจริง
// (ข้อยกเว้น soft delete ที่ตั้งใจ ข้อ 6.16 — กติกาตัดสินอยู่ pushRules.isDeadSubscription)
export const sendPushToUser = async (userId, payload) => {
  if (!enabled || !userId) return;
  const rows = await prisma.pushSubscription.findMany({ where: { user_id: userId } });
  const body = JSON.stringify(payload);
  await Promise.all(rows.map(async (row) => {
    try {
      await webpush.sendNotification(JSON.parse(row.subscription), body);
    } catch (err) {
      if (isDeadSubscription(err.statusCode)) {
        // ลบพลาด (เช่นแถวถูกลบไปก่อนแล้ว) ไม่ใช่เหตุให้การส่งเจ้าอื่นล้ม — กลืนได้
        await prisma.pushSubscription.delete({ where: { endpoint: row.endpoint } }).catch(() => {});
      }
      // รหัสอื่น (429/5xx/เน็ตล่ม) = ชั่วคราว เก็บแถวไว้ส่งรอบหน้า — ไม่ log รายอุปกรณ์กัน log ท่วม
    }
  }));
};
