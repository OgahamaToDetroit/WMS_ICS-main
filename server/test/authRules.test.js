// เทสต์แบบเบา (node --test) เฉพาะ "กติกาที่ database บังคับเองไม่ได้" ของเส้น auth
// — ไม่ต้องต่อ database เพราะกติกาถูกแยกไว้เป็น pure function ใน utils/authRules.js
// รัน: npm test (ในโฟลเดอร์ server/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canLogin,
  loginRejectionMessage,
  toAuthUser,
  avatarForUser,
  isResetTokenUsable,
  normalizeRole,
  normalizeStatus
} from '../utils/authRules.js';

// ---------------------------------------------------------------------------
// กติกา: login ได้ต้องผ่านสองแกน status=Active "และ" is_active=true (DATABASE.md ข้อ 6.5)
// ---------------------------------------------------------------------------

test('canLogin: ผ่านเฉพาะ Active + is_active=true พร้อมกันเท่านั้น', () => {
  assert.equal(canLogin({ status: 'Active', is_active: true }), true);
});

test('canLogin: Active แต่ถูกปลดระวาง (is_active=false) → เข้าไม่ได้ (แกนปลดระวางคนละเรื่องกับอนุมัติ)', () => {
  assert.equal(canLogin({ status: 'Active', is_active: false }), false);
});

test('canLogin: อนุมัติแล้วแต่ยัง Pending/Denied → เข้าไม่ได้แม้ is_active=true', () => {
  assert.equal(canLogin({ status: 'Pending', is_active: true }), false);
  assert.equal(canLogin({ status: 'Denied', is_active: true }), false);
});

test('canLogin: user เป็น null/undefined ต้องไม่ระเบิด และคืน false', () => {
  assert.equal(canLogin(null), false);
  assert.equal(canLogin(undefined), false);
});

test('loginRejectionMessage: คืนข้อความตรงเหตุ และคืน null เมื่อเข้าได้', () => {
  assert.equal(loginRejectionMessage({ status: 'Active', is_active: true }), null);
  assert.equal(loginRejectionMessage({ status: 'Pending', is_active: true }), 'บัญชีรอผลการอนุมัติ');
  assert.equal(loginRejectionMessage({ status: 'Denied', is_active: true }), 'บัญชีนี้ไม่ได้รับอนุมัติให้ใช้งานระบบ');
  assert.equal(loginRejectionMessage({ status: 'Active', is_active: false }), 'บัญชีนี้ถูกระงับการใช้งาน');
});

test('loginRejectionMessage สอดคล้องกับ canLogin: มีข้อความ ⟺ เข้าไม่ได้', () => {
  const cases = [
    { status: 'Active', is_active: true },
    { status: 'Active', is_active: false },
    { status: 'Pending', is_active: true },
    { status: 'Denied', is_active: true }
  ];
  for (const u of cases) {
    assert.equal(loginRejectionMessage(u) === null, canLogin(u));
  }
});

// ---------------------------------------------------------------------------
// กติกา: ทรง JSON ของ /login + /verify-token — มี status + avatarUrl ผ่าน fallback (ไม่มีวันว่าง)
// และห้ามหลุด password_hash ออกไปหน้าเว็บ
// ---------------------------------------------------------------------------

test('toAuthUser: ทรงตรง {id,username,email,role,status,avatarUrl} และไม่หลุด password_hash', () => {
  const safe = toAuthUser({
    id: 1,
    username: 'admin',
    email: 'admin@wms.local',
    role: 'Admin',
    status: 'Active',
    is_active: true,
    password_hash: '$2a$10$secret',
    avatarUrl: '/uploads/a.png'
  });
  assert.deepEqual(Object.keys(safe).sort(), ['avatarUrl', 'email', 'id', 'role', 'status', 'username']);
  assert.equal(safe.password_hash, undefined);
  assert.equal(safe.status, 'Active'); // /login และ /verify-token ต้องมี status
  assert.equal(safe.avatarUrl, '/uploads/a.png');
});

test('avatarForUser: ไม่มีรูป (NULL/ว่าง) generate จากชื่อ — ทรง /login ไม่เคยส่ง avatarUrl ว่าง', () => {
  const generated = avatarForUser({ username: 'somchai', avatarUrl: null });
  assert.ok(generated.startsWith('https://ui-avatars.com/api/?name=somchai'));
  assert.equal(avatarForUser({ username: 'x', avatarUrl: '' }).startsWith('https://ui-avatars.com/'), true);
});

// ---------------------------------------------------------------------------
// กติกา: โทเคนลืมรหัสผ่าน ใช้ครั้งเดียว + หมดอายุ (DATABASE.md ข้อ 6.6)
// ---------------------------------------------------------------------------

test('isResetTokenUsable: โทเคนสด (ยังไม่ใช้ + ยังไม่หมดอายุ) → ใช้ได้', () => {
  const future = new Date(Date.now() + 1000 * 60 * 10);
  assert.equal(isResetTokenUsable({ used_at: null, expires_at: future }), true);
});

test('isResetTokenUsable: ใช้ไปแล้ว (used_at ไม่ null) → ใช้ซ้ำไม่ได้ แม้ยังไม่หมดอายุ', () => {
  const future = new Date(Date.now() + 1000 * 60 * 10);
  assert.equal(isResetTokenUsable({ used_at: new Date(), expires_at: future }), false);
});

test('isResetTokenUsable: หมดอายุแล้ว → ใช้ไม่ได้ แม้ยังไม่เคยใช้', () => {
  const past = new Date(Date.now() - 1000);
  assert.equal(isResetTokenUsable({ used_at: null, expires_at: past }), false);
});

test('isResetTokenUsable: ไม่มีโทเคน (null) → ใช้ไม่ได้ ไม่ระเบิด', () => {
  assert.equal(isResetTokenUsable(null), false);
});

// ---------------------------------------------------------------------------
// กติกา: enum จำลอง — ค่านอกชุดต้องถูกดันกลับเป็น default (SQLite ไม่มี enum)
// ---------------------------------------------------------------------------

test('normalizeRole/Status: ค่านอกชุดกลายเป็น default, ค่าถูกต้องผ่านตามเดิม', () => {
  assert.equal(normalizeRole('Admin'), 'Admin');
  assert.equal(normalizeRole('SuperUser'), 'Operator');
  assert.equal(normalizeStatus('Active'), 'Active');
  assert.equal(normalizeStatus('Banned'), 'Pending');
});
