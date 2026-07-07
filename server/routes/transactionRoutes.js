import express from 'express';
import {
  cancelTransaction,
  createInboundTransaction,
  createOutboundRequest,
  getHistory,
  getTransactions,
  resolveTransaction
} from '../controllers/transactionController.js';
import { authorizeRoles, verifyAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/transactions/request', verifyAuth, createOutboundRequest);
router.post('/transactions/inbound', verifyAuth, authorizeRoles('Admin', 'Manager'), createInboundTransaction);
router.get('/transactions', verifyAuth, getTransactions);
router.get('/transactions/history', verifyAuth, getHistory);
router.put('/transactions/:id/resolve', verifyAuth, authorizeRoles('Admin', 'Manager'), resolveTransaction);
router.put('/transactions/:id/cancel', verifyAuth, cancelTransaction);

export default router;
