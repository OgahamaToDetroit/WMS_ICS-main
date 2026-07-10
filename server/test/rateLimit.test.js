// เทสต์เบา rate limit — พินเฉพาะค่าที่เป็น "กติกา" ของเรา ไม่เทสต์ตัวไลบรารี
import test from 'node:test';
import assert from 'node:assert/strict';
import { LIMITS } from '../middleware/rateLimit.js';

test('login/reset นับเฉพาะครั้งที่พลาด — คนล็อกอินถูกไม่กินโควตา (กันทั้งออฟฟิศหลัง NAT โดนล็อกยกแผง)', () => {
  assert.equal(LIMITS.login.skipSuccessfulRequests, true);
  assert.equal(LIMITS.resetPassword.skipSuccessfulRequests, true);
});

test('forgot/register นับทุกครั้ง — เป้าหมายคือกันสแปมอีเมล/สมัครรัว ไม่ใช่กันเดารหัส', () => {
  assert.equal(LIMITS.forgotPassword.skipSuccessfulRequests, undefined);
  assert.equal(LIMITS.register.skipSuccessfulRequests, undefined);
});

test('ตัวเลขโควตาตามที่เคาะ (ตาม reference): login/reset 15 พลาด/15นาที · forgot 6/ชม. · register 10/ชม.', () => {
  assert.deepEqual([LIMITS.login.windowMs, LIMITS.login.max], [15 * 60 * 1000, 15]);
  assert.deepEqual([LIMITS.resetPassword.windowMs, LIMITS.resetPassword.max], [15 * 60 * 1000, 15]);
  assert.deepEqual([LIMITS.forgotPassword.windowMs, LIMITS.forgotPassword.max], [60 * 60 * 1000, 6]);
  assert.deepEqual([LIMITS.register.windowMs, LIMITS.register.max], [60 * 60 * 1000, 10]);
});

test('ทุกโควตามีข้อความภาษาไทยบอกผู้ใช้ ไม่ปล่อย 429 เปล่าๆ', () => {
  for (const [name, limit] of Object.entries(LIMITS)) {
    assert.ok(limit.message && limit.message.length > 0, `LIMITS.${name} ไม่มีข้อความ`);
  }
});
