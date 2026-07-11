import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';

const serverDir = fileURLToPath(new URL('../../', import.meta.url));
const prismaCliPath = path.join(serverDir, 'node_modules', 'prisma', 'build', 'index.js');
const TEST_PASSWORD = 'Integration123!';
const TEST_JWT_SECRET = 'integration-test-jwt-secret-at-least-32-characters';

const removeTempDir = (tempDir) => {
  const resolvedTempDir = path.resolve(tempDir);
  const resolvedOsTemp = path.resolve(os.tmpdir());
  const isOwnedTestDir = path.dirname(resolvedTempDir) === resolvedOsTemp
    && path.basename(resolvedTempDir).startsWith('wms-test-');

  if (!isOwnedTestDir) {
    throw new Error(`ปฏิเสธการลบ temp path ที่ไม่ใช่ของ integration test: ${resolvedTempDir}`);
  }
  fs.rmSync(resolvedTempDir, { recursive: true, force: true });
};

const migrateTempDatabase = (databaseUrl) => {
  if (!fs.existsSync(prismaCliPath)) {
    throw new Error(`ไม่พบ Prisma CLI สำหรับ integration test: ${prismaCliPath}`);
  }

  // Node 25 บน Windows บล็อกการ spawn ไฟล์ .cmd และ npx ใน non-interactive shell อาจรอ prompt
  // จึงเรียก Prisma CLI ที่ติดตั้งใน server/node_modules ผ่าน Node โดยตรง — เป็น CLI ตัวเดียวกับ npx ใช้
  const result = spawnSync(process.execPath, [prismaCliPath, 'migrate', 'deploy'], {
    cwd: serverDir,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: 'utf8',
    windowsHide: true
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error([
      'prisma migrate deploy สำหรับฐาน integration test ล้มเหลว',
      result.stdout,
      result.stderr
    ].filter(Boolean).join('\n'));
  }
};

const seedFixtures = async (prisma) => {
  const password_hash = await bcrypt.hash(TEST_PASSWORD, 10);
  const users = {};

  for (const role of ['Admin', 'Operator', 'Viewer']) {
    const key = role.toLowerCase();
    users[key] = await prisma.user.create({
      data: {
        name: `Integration ${role}`,
        username: `integration_${key}`,
        email: `integration_${key}@example.test`,
        password_hash,
        role,
        status: 'Active',
        is_active: true
      }
    });
  }

  await prisma.itemGroup.createMany({
    data: [
      { group_id: '01', group_name: 'Integration Group 01' },
      { group_id: '02', group_name: 'Integration Group 02' }
    ]
  });

  const items = {
    lowStock: '01001',
    nullMinStock: '01003',
    transaction: '02001'
  };

  await prisma.item.createMany({
    data: [
      { item_id: items.lowStock, name: 'Integration Low Stock', group_id: '01', unit: 'ชิ้น', min_stock: 100 },
      { item_id: items.nullMinStock, name: 'Integration Null Min Stock', group_id: '01', unit: 'ชิ้น', min_stock: null },
      { item_id: items.transaction, name: 'Integration Transaction Item', group_id: '02', unit: 'ชิ้น', min_stock: 10 }
    ]
  });

  const now = new Date();
  await prisma.stockTransaction.createMany({
    data: [
      { item_id: items.lowStock, type: 'OPENING', qty_change: 50, transaction_date: now },
      { item_id: items.nullMinStock, type: 'OPENING', qty_change: 50, transaction_date: now },
      { item_id: items.transaction, type: 'OPENING', qty_change: 50, transaction_date: now }
    ]
  });

  return {
    password: TEST_PASSWORD,
    users,
    items
  };
};

export const setupIntegrationTest = async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wms-test-'));
  const dbPath = path.join(tempDir, 'warehouse.test.db');
  const databaseUrl = `file:${dbPath.replaceAll('\\', '/')}`;
  let prisma = null;

  // Prisma schema engine ในสภาพแวดล้อม Windows นี้เปิดไฟล์ฐานใหม่เองไม่สำเร็จ;
  // สร้างไฟล์ว่างใน temp directory ก่อน แล้วให้ migrate deploy สร้าง schema ตามปกติ
  fs.closeSync(fs.openSync(dbPath, 'w'));

  // ต้องตั้งก่อน dynamic import app/prisma เสมอ — dotenv จะไม่ทับ env ที่มีอยู่แล้ว
  process.env.DATABASE_URL = databaseUrl;
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  process.env.FRONTEND_URL = 'http://localhost:5173';
  process.env.EMAIL_USER = '';
  process.env.EMAIL_PASS = '';
  process.env.VAPID_PUBLIC_KEY = '';
  process.env.VAPID_PRIVATE_KEY = '';
  process.env.VAPID_SUBJECT = 'mailto:integration@example.test';

  try {
    migrateTempDatabase(databaseUrl);

    // ห้ามเปลี่ยนเป็น static import: ESM จะ hoist ก่อนตั้ง DATABASE_URL ด้านบน
    const [{ default: app }, prismaModule] = await Promise.all([
      import('../../app.js'),
      import('../../prisma.js')
    ]);
    prisma = prismaModule.prisma;
    const fixtures = await seedFixtures(prisma);
    let cleaned = false;

    return {
      app,
      prisma,
      fixtures,
      dbPath,
      cleanup: async () => {
        if (cleaned) return;
        cleaned = true;
        await prisma.$disconnect();
        removeTempDir(tempDir);
      }
    };
  } catch (error) {
    if (prisma) await prisma.$disconnect();
    removeTempDir(tempDir);
    throw error;
  }
};
