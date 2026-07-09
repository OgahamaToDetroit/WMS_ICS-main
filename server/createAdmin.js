// สร้าง/รีเซ็ต admin คนแรกในตาราง users ของ database ใหม่ — รันด้วย `npm run create-admin`
// เป็นช่องทางเดียวที่ seed admin (userManager ไม่ seed ตอน import อีกต่อไป ตาม DATABASE.md ข้อ 4)
// ถ้าไม่รันตัวนี้ก่อน ตาราง users จะว่าง → login ไม่ได้เพราะไม่มีบัญชีเลย
import bcrypt from 'bcryptjs';
import { prisma } from './prisma.js';
import { config } from './config.js';

async function createAdmin() {
  const { username, password } = config.bootstrapAdmin;
  const email = String(config.bootstrapAdmin.email || '').trim().toLowerCase();

  if (!password) {
    throw new Error('BOOTSTRAP_ADMIN_PASSWORD is required to create an admin account.');
  }

  const password_hash = await bcrypt.hash(password, 10);

  // upsert ด้วย username (unique) — มีอยู่แล้วรีเซ็ตรหัส/ยกเป็น Admin ให้ · ยังไม่มีสร้างใหม่
  // name (NOT NULL) default = username · role=Admin + status=Active + is_active=true = login ได้ทันที
  const user = await prisma.user.upsert({
    where: { username },
    update: { email, password_hash, role: 'Admin', status: 'Active', is_active: true },
    create: { name: username, username, email, password_hash, role: 'Admin', status: 'Active', is_active: true }
  });

  console.log(`Admin account "${user.username}" is ready.`);
}

createAdmin()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
