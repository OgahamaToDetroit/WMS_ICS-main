// server/config.js
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

export const config = {
  port: process.env.PORT || 5000,
  jwtSecret: process.env.JWT_SECRET,
  email: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  bootstrapAdmin: {
    username: process.env.BOOTSTRAP_ADMIN_USERNAME || 'admin',
    email: process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@wms.local',
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD || ''
  }
};

if (!config.jwtSecret) {
  throw new Error('JWT_SECRET is required. Please set it in the server environment.');
}

if (config.jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters long.');
}

// เช็คค่าที่สำคัญว่าถูกตั้งค่าหรือยัง
if (!config.email.user || !config.email.pass) {
  console.warn('⚠️ Warning: Email configuration is missing in .env — email features will be skipped.');
}
