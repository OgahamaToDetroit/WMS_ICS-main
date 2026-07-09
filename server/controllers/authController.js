// เส้น auth ย้ายมาใช้ database ใหม่ (ผ่าน server/prisma.js + data/userManager.js) แล้ว — บทบาท "ล่าม":
// ใช้ตาราง users/password_reset_tokens ของฐานใหม่ข้างใน แต่ตอบ JSON ทรงเดิมให้หน้า React เป๊ะ
// กติกาที่ database บังคับเองไม่ได้อยู่ที่ utils/authRules.js (แยกไว้เทสต์ได้)
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { getUserById, getUserByUsername, getUserByEmail, createUser, updateUser } from '../data/userManager.js';
import { canLogin, isResetTokenUsable, loginRejectionMessage, toAuthUser } from '../utils/authRules.js';
import { tryLogAudit } from '../utils/audit.js';
import { sendEmail } from '../utils/sendEmail.js';
import { config } from '../config.js';
import { prisma } from '../prisma.js';

const RESET_TOKEN_TTL_MS = 1000 * 60 * 30;

const hashResetToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const signToken = (user) => jwt.sign(
  { id: user.id, username: user.username, role: user.role },
  config.jwtSecret,
  { expiresIn: '1d' }
);

export const login = async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'กรุณากรอก Username และ Password' });
  }

  const user = await getUserByUsername(String(username).trim());

  if (!user) {
    return res.status(401).json({ success: false, message: 'Username หรือ Password ไม่ถูกต้อง' });
  }

  const isPasswordValid = await bcrypt.compare(password, user.password_hash);
  if (!isPasswordValid) {
    return res.status(401).json({ success: false, message: 'Username หรือ Password ไม่ถูกต้อง' });
  }

  // เงื่อนไข login สองแกน (status=Active และ is_active=true) — ข้อความปฏิเสธแยกตามเหตุผล
  const rejection = loginRejectionMessage(user);
  if (rejection) {
    return res.status(403).json({ success: false, message: rejection });
  }

  const token = signToken(user);
  await tryLogAudit(user.id, 'auth.login', 'user', user.id);

  return res.status(200).json({
    success: true,
    token,
    ...toAuthUser(user)
  });
};

export const register = async (req, res) => {
  const username = String(req.body.username || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const { password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลสมัครสมาชิกให้ครบถ้วน' });
  }

  if (password.length < 8) {
    return res.status(400).json({ success: false, message: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' });
  }

  const isTaken = (await getUserByUsername(username)) || (await getUserByEmail(email));
  if (isTaken) {
    return res.status(400).json({ success: false, message: 'Username หรือ Email นี้มีผู้ใช้งานแล้ว' });
  }

  // สมัครเอง → status=Pending รออนุมัติ (DATABASE.md ข้อ 6.5) · role เริ่มที่ Operator เสมอ
  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = await createUser({ username, email, password_hash: hashedPassword, role: 'Operator', status: 'Pending' });
  await tryLogAudit(newUser.id, 'auth.register', 'user', newUser.id, { status: 'Pending' });

  await sendEmail(email, 'WMS - ยืนยันการสมัครสมาชิก (รอผลอนุมัติ)', `
    <h2>สวัสดีคุณ ${username}</h2>
    <p>ระบบได้รับคำขอสมัครสมาชิกของคุณเรียบร้อยแล้ว ขณะนี้สถานะคือ <b>กำลังรอการอนุมัติ</b></p>
    <p>หากผู้ดูแลระบบทำการอนุมัติ คุณจะได้รับอีเมลแจ้งเตือนอีกครั้ง</p>
  `);

  return res.status(200).json({ success: true, message: 'สมัครสมาชิกสำเร็จ กรุณารอการอนุมัติ' });
};

export const forgotPassword = async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!email) {
    return res.status(400).json({ success: false, message: 'กรุณาระบุอีเมล' });
  }

  const user = await getUserByEmail(email);

  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashResetToken(token);
    const now = new Date();

    // เก็บ hash ของโทเคน ไม่เก็บโทเคนจริง (ใครเห็นตารางก็ปลอมลิงก์รีเซ็ตไม่ได้)
    // ลบโทเคนเก่าของ user นี้ + โทเคนที่หมดอายุ/ใช้แล้วทั้งหมด (กันตารางบวม)
    await prisma.passwordResetToken.deleteMany({
      where: { OR: [{ user_id: user.id }, { expires_at: { lt: now } }, { used_at: { not: null } }] }
    });
    await prisma.passwordResetToken.create({
      data: {
        token_hash: tokenHash,
        user_id: user.id,
        expires_at: new Date(now.getTime() + RESET_TOKEN_TTL_MS)
      }
    });

    const resetLink = `${config.frontendUrl}/reset-password/${token}`;

    await sendEmail(email, 'WMS - รีเซ็ตรหัสผ่าน', `
      <h2>คำขอรีเซ็ตรหัสผ่าน</h2>
      <p>คลิกที่ลิงก์ด้านล่างเพื่อตั้งรหัสผ่านใหม่ของคุณ:</p>
      <a href="${resetLink}" style="padding: 10px 20px; background: #0D8ABC; color: white; text-decoration: none; border-radius: 5px;">รีเซ็ตรหัสผ่าน</a>
      <p><i>หากคุณไม่ได้ทำรายการนี้ กรุณาเพิกเฉยต่ออีเมลฉบับนี้</i></p>
    `);
  }

  // ตอบเหมือนกันทุกกรณี (มี/ไม่มีอีเมลในระบบ) — กันคนเดาว่าอีเมลไหนมีบัญชี
  return res.json({ success: true, message: 'หากอีเมลนี้อยู่ในระบบ เราจะส่งลิงก์รีเซ็ตรหัสผ่านให้' });
};

export const resetPassword = async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token) {
    return res.status(400).json({ success: false, message: 'ลิงก์รีเซ็ตรหัสผ่านไม่ถูกต้อง' });
  }

  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ success: false, message: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร' });
  }

  const tokenHash = hashResetToken(token);
  const tokenData = await prisma.passwordResetToken.findUnique({
    where: { token_hash: tokenHash },
    include: { user: true }
  });

  // ใช้ครั้งเดียว + หมดอายุ — เงื่อนไขอยู่ที่ isResetTokenUsable (database บังคับเองไม่ได้)
  if (!isResetTokenUsable(tokenData)) {
    if (tokenData) await prisma.passwordResetToken.delete({ where: { token_hash: tokenHash } });
    return res.status(400).json({ success: false, message: 'ลิงก์รีเซ็ตรหัสผ่านไม่ถูกต้อง หรือหมดอายุแล้ว' });
  }

  const user = tokenData.user;
  if (!user) {
    return res.status(404).json({ success: false, message: 'ไม่พบผู้ใช้งาน' });
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await updateUser(user.id, { password_hash: hashedPassword });
  await prisma.passwordResetToken.update({ where: { token_hash: tokenHash }, data: { used_at: new Date() } });
  await tryLogAudit(user.id, 'auth.password_reset', 'user', user.id);

  return res.json({ success: true, message: 'รีเซ็ตรหัสผ่านสำเร็จ คุณสามารถเข้าสู่ระบบได้ทันที' });
};

export const verifyToken = async (req, res) => {
  const user = await getUserById(req.user.id);

  if (!canLogin(user)) {
    return res.status(403).json({ success: false, message: 'บัญชีนี้ไม่พร้อมใช้งาน' });
  }

  return res.status(200).json({ success: true, user: toAuthUser(user) });
};
