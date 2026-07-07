// server/routes/authRoutes.js
import express from 'express';
import { login, verifyToken, register, forgotPassword, resetPassword } from '../controllers/authController.js';
import { verifyAuth } from '../middleware/authMiddleware.js';

const router = express.Router();
router.post('/login', login);
router.post('/register', register);
router.get('/verify-token', verifyAuth, verifyToken);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

export default router;
