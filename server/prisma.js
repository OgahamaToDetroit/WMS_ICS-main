// PrismaClient ตัวเดียวของทั้งแอป — controller ที่ย้ายมาฐานใหม่แล้ว import จากที่นี่เท่านั้น
// (client 1 ตัว = เปิดไฟล์ database 1 handle — สร้างกระจายหลายตัวทั้งเปลืองและเสี่ยงชนกันเอง)
//
// Prisma 7: ต้องส่ง driver adapter เสมอ (new PrismaClient() เปล่าๆ ไม่รู้จะต่อ database ยังไง)
// adapter คือตัวเชื่อม Prisma ↔ better-sqlite3 ซึ่งเป็นไลบรารีที่คุยกับไฟล์ SQLite จริง
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from './generated/prisma/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Prisma 7 ไม่อ่าน .env ให้เอง — โหลดเองแบบระบุ path กันเคสรันจาก cwd อื่น (แบบเดียวกับ config.js)
dotenv.config({ path: path.join(__dirname, '.env') });

if (!process.env.DATABASE_URL) {
  // ตายดังๆ ดีกว่าเดา path เอง — เดาผิดเมื่อไหร่ better-sqlite3 จะสร้างไฟล์ฐานเปล่าให้เงียบๆ
  throw new Error('DATABASE_URL is required. Please set it in server/.env (ดู server/.env.example)');
}

// path แบบ relative ใน .env ให้ยึดโฟลเดอร์ server/ เสมอ ไม่ใช่ cwd ตอนสั่งรัน —
// ไม่งั้นรัน `node server/index.js` จากโฟลเดอร์รากจะได้ไฟล์ฐานเปล่าผิดที่โดยไม่มี error อะไรเลย
const rawPath = process.env.DATABASE_URL.replace(/^file:/, '');
const dbPath = path.isAbsolute(rawPath) ? rawPath : path.join(__dirname, rawPath);

const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });

export const prisma = new PrismaClient({ adapter });
