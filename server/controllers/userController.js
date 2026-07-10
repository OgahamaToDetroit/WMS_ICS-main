// server/controllers/userController.js — จัดการผู้ใช้ (ฝั่ง Admin) ย้ายมาฐานใหม่แล้ว
// บทบาท "ล่าม": ทรง JSON แต่ละ endpoint คงเดิมเป๊ะ (แต่ละอันไม่เหมือนกัน ห้ามยุบรวม)
import {
  getUsers,
  getUserById,
  getUserByUsername,
  getUserByEmail,
  updateUser,
  deactivateUser,
  countActiveAdmins
} from '../data/userManager.js';
import { VALID_ROLES, VALID_STATUSES } from '../utils/authRules.js';
import { tryLogAudit } from '../utils/audit.js';
import { sendEmail } from '../utils/sendEmail.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { broadcast } from '../events.js';

export const getUsersList = async (req, res) => {
  // ไม่ส่ง password_hash กลับหน้าเว็บ · avatarUrl ดิบ (NULL → '' ให้ตรงทรงเดิมที่ default เป็น '')
  const users = await getUsers();
  const safeUsers = users.map((user) => ({
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    status: user.status,
    avatarUrl: user.avatarUrl || ''
  }));
  res.json({ success: true, users: safeUsers });
};

// ฝั่ง Admin กด Accept หรือ Deny
export const updateUserStatus = async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { status } = req.body; // รับค่า 'Active' หรือ 'Denied'

    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: 'สถานะผู้ใช้ไม่ถูกต้อง' });
    }

    const existing = await getUserById(userId);
    if (!existing) return res.status(404).json({ success: false, message: 'ไม่พบผู้ใช้งาน' });

    if (existing.role === 'Admin' && status !== 'Active' && (await countActiveAdmins()) <= 1) {
      return res.status(400).json({ success: false, message: 'ต้องมี Admin ที่ใช้งานได้อย่างน้อย 1 คน' });
    }

    const user = await updateUser(userId, { status });
    await tryLogAudit(req.user?.id, 'user.status_update', 'user', userId, { status });
    broadcast('users'); // ยิงทันทีหลังเขียนฐานสำเร็จ — ไม่รอขั้นส่งเมลที่ช้า/ล่มได้

    const subject = status === 'Active' ? 'WMS - บัญชีของคุณได้รับการอนุมัติแล้ว 🎉' : 'WMS - บัญชีของคุณถูกปฏิเสธ';
    const htmlMessage = status === 'Active'
      ? `<h2>ยินดีด้วยคุณ ${user.username}</h2><p>บัญชีของคุณได้รับการอนุมัติให้เข้าใช้งานระบบ WMS แล้ว คุณสามารถเข้าสู่ระบบได้ทันที</p><a href="${config.frontendUrl}/login">เข้าสู่ระบบ</a>`
      : `<h2>เรียนคุณ ${user.username}</h2><p>ขออภัย บัญชีของคุณไม่ได้รับการอนุมัติให้เข้าใช้งานระบบ</p>`;

    await sendEmail(user.email, subject, htmlMessage);

    res.json({ success: true, message: 'อัปเดตสถานะและส่งอีเมลแจ้งเตือนสำเร็จ' });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const updateUserRole = async (req, res) => {
  const userId = parseInt(req.params.id);
  const { role } = req.body;

  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ success: false, message: 'บทบาทผู้ใช้ไม่ถูกต้อง' });
  }

  const existing = await getUserById(userId);
  if (!existing) return res.status(404).json({ success: false, message: 'ไม่พบผู้ใช้งาน' });

  if (existing.role === 'Admin' && role !== 'Admin' && (await countActiveAdmins()) <= 1) {
    return res.status(400).json({ success: false, message: 'ต้องมี Admin ที่ใช้งานได้อย่างน้อย 1 คน' });
  }

  await updateUser(userId, { role });
  await tryLogAudit(req.user?.id, 'user.role_update', 'user', userId, { role });
  broadcast('users'); // จุดนี้ reference ไม่ยิง — ของเรายิงให้ครบ: ตาราง users เปลี่ยนเมื่อไหร่ก็ควรมีสัญญาณ
  return res.json({ success: true });
};

// "ลบ" = soft delete (is_active=false) เท่านั้น — FK ทุกเส้นตั้ง RESTRICT (DATABASE.md ข้อ 5)
// หน้าเว็บลบแถวออกจากตารางแบบ optimistic อยู่แล้ว + getUsersList กรอง is_active → หายจากตารางเหมือนเดิม
export const deleteUser = async (req, res) => {
  const userId = parseInt(req.params.id);
  if (userId === req.user?.id) {
    return res.status(400).json({ success: false, message: 'ไม่สามารถลบบัญชีของตัวเองได้' });
  }

  const targetUser = await getUserById(userId);
  if (!targetUser) {
    return res.status(404).json({ success: false, message: 'ไม่พบผู้ใช้งานที่ต้องการลบ' });
  }

  if (targetUser.role === 'Admin' && (await countActiveAdmins()) <= 1) {
    return res.status(400).json({ success: false, message: 'ต้องมี Admin ที่ใช้งานได้อย่างน้อย 1 คน' });
  }

  await deactivateUser(userId);
  await tryLogAudit(req.user?.id, 'user.delete', 'user', userId, { username: targetUser.username });
  broadcast('users');
  res.json({ success: true, message: 'ลบผู้ใช้งานสำเร็จ' });
};

export const updateProfile = async (req, res) => {
  try {
    const { newUsername, email, password, avatarUrl } = req.body;

    const current = await getUserById(req.user?.id);
    if (!current) return res.status(404).json({ success: false, message: 'ไม่พบผู้ใช้งาน' });

    const updates = {};

    // 1. เช็คว่า Username ใหม่ซ้ำกับคนอื่นไหม
    if (newUsername && newUsername !== current.username) {
      const isTaken = await getUserByUsername(newUsername);
      if (isTaken && isTaken.id !== current.id) {
        return res.status(400).json({ success: false, message: 'Username นี้ถูกใช้งานแล้ว' });
      }
      updates.username = newUsername;
    }

    // 2. เช็คว่า Email ใหม่ซ้ำกับคนอื่นไหม
    if (email) {
      const normalizedEmail = String(email).trim().toLowerCase();
      const emailTaken = await getUserByEmail(normalizedEmail);
      if (emailTaken && emailTaken.id !== current.id) {
        return res.status(400).json({ success: false, message: 'Email นี้ถูกใช้งานแล้ว' });
      }
      updates.email = normalizedEmail;
    }
    if (typeof avatarUrl === 'string') updates.avatarUrl = avatarUrl;

    // 3. Hash รหัสผ่านใหม่ก่อนเซฟเสมอ
    if (password) {
      if (password.length < 8) {
        return res.status(400).json({ success: false, message: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร' });
      }
      updates.password_hash = await bcrypt.hash(password, 10);
    }

    const updated = await updateUser(current.id, updates);
    await tryLogAudit(req.user?.id, 'user.profile_update', 'user', updated.id);

    // 4. ออก Token ใหม่เฉพาะตอนที่ Username เปลี่ยน (เพราะ payload เปลี่ยน)
    //    ต้องพก sid ของ session ปัจจุบันไปด้วย (ข้อ 6.15) — ไม่งั้น token ใหม่ sid หาย
    //    โดนด่าน session ตัดออกทันทีที่คำขอถัดไป กลายเป็น "เปลี่ยนชื่อแล้วหลุดเอง"
    const newToken = updates.username
      ? jwt.sign(
          { id: updated.id, username: updated.username, role: updated.role, sid: updated.session_id },
          config.jwtSecret,
          { expiresIn: '1d' }
        )
      : null;

    res.json({
      success: true,
      message: 'อัปเดตข้อมูลสำเร็จ',
      token: newToken,
      user: {
        id: updated.id,
        username: updated.username,
        email: updated.email,
        role: updated.role,
        avatarUrl: updated.avatarUrl || ''
      }
    });
  } catch {
    res.status(500).json({ success: false, message: 'Update profile error' });
  }
};
