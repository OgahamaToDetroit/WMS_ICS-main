import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import authRoutes from './routes/authRoutes.js';
import transactionRoutes from './routes/transactionRoutes.js';
import userRoutes from './routes/userRoutes.js';
import productRoutes from './routes/productRoutes.js';
import uploadRoutes from './upload.js';
import { config } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors({
  origin: config.frontendUrl,
  credentials: true
}));
app.use(express.json());

// เปิดทางให้เข้าถึงรูปในโฟลเดอร์ uploads ได้
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api', authRoutes);
app.use('/api', transactionRoutes);
app.use('/api', userRoutes);
app.use('/api', productRoutes);
app.use('/api', uploadRoutes);

app.listen(config.port, () => console.log(`🚀 Server running on port ${config.port}`));
