// server/routes/authRoutes.js
import express from 'express';
import { login, verifyToken, register, forgotPassword, resetPassword } from '../controllers/authController.js';
import { verifyAuth } from '../middleware/authMiddleware.js';
import { loginLimiter, registerLimiter, forgotPasswordLimiter, resetPasswordLimiter } from '../middleware/rateLimit.js';

const router = express.Router();
// endpoint ก่อน login ทุกตัวมี rate limit — เป็นด่านเดียวที่คนนอก (ยังไม่มี token) ยิงถึง
router.post('/login', loginLimiter, login);
router.post('/register', registerLimiter, register);
router.get('/verify-token', verifyAuth, verifyToken);
router.post('/forgot-password', forgotPasswordLimiter, forgotPassword);
router.post('/reset-password', resetPasswordLimiter, resetPassword);

export default router;
