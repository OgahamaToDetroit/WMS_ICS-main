import express from 'express';
import {
  cancelTransaction,
  createInboundTransaction,
  createOutboundRequest,
  getHistory,
  getTransactions,
  markPickedUp,
  resolveTransaction
} from '../controllers/transactionController.js';
import { authorizeRoles, verifyAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

// Viewer ดูได้อย่างเดียว (ข้อ 6.13) — สร้าง/ยกเลิกใบเบิกไม่ได้ ด่านหลักอยู่ที่ server ตรงนี้
// (ยกเลิกมีเงื่อนไข "เจ้าของใบ" ซ้อนอีกชั้นใน controller — การ์ด role ที่ route กันแค่ Viewer)
router.post('/transactions/request', verifyAuth, authorizeRoles('Admin', 'Manager', 'Operator'), createOutboundRequest);
router.post('/transactions/inbound', verifyAuth, authorizeRoles('Admin', 'Manager'), createInboundTransaction);
router.get('/transactions', verifyAuth, getTransactions);
router.get('/transactions/history', verifyAuth, getHistory);
router.put('/transactions/:id/resolve', verifyAuth, authorizeRoles('Admin', 'Manager'), resolveTransaction);
// ผู้ขอกดยืนยันรับของเองไม่ได้ — หลักฐานการส่งมอบต้องมาจากคนคลัง (ข้อ 6.14)
router.put('/transactions/:id/pickup', verifyAuth, authorizeRoles('Admin', 'Manager'), markPickedUp);
router.put('/transactions/:id/cancel', verifyAuth, authorizeRoles('Admin', 'Manager', 'Operator'), cancelTransaction);

export default router;
