// ตั้งค่า Prisma CLI (Prisma 7 ไม่อ่าน .env ให้เอง — ต้อง import dotenv เอง)
// เจตนา: ไม่ลงทะเบียน seed — database จริงห้ามมีปุ่ม "ล้างแล้วเติมข้อมูลตั้งต้น" (ดู DATABASE.md ข้อ 3)
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
