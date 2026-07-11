import express from 'express';
import {
  createProduct,
  deleteProduct,
  getDashboardStats,
  getProductGroups,
  getProducts,
  restoreProduct,
  updateProduct
} from '../controllers/productController.js';
import { authorizeRoles, verifyAuth } from '../middleware/authMiddleware.js';

const router = express.Router();
router.get('/products', verifyAuth, getProducts);
// รายชื่อกลุ่ม เปิดให้ทุกคนที่ login (ใช้แสดง dropdown) — สิทธิ์สร้างจริงคุมที่ POST /products อยู่แล้ว
router.get('/product-groups', verifyAuth, getProductGroups);
router.post('/products', verifyAuth, authorizeRoles('Admin', 'Manager'), createProduct);
router.put('/products/:id', verifyAuth, authorizeRoles('Admin', 'Manager'), updateProduct);
router.delete('/products/:id', verifyAuth, authorizeRoles('Admin'), deleteProduct);
router.put('/products/:id/restore', verifyAuth, authorizeRoles('Admin'), restoreProduct);
// POST /products/import ถูกพักตามการตัดสินใจข้อ 11 — ประตูหลังเลี่ยงระบบออกรหัสตามกลุ่ม
router.get('/wms/dashboard-stats', verifyAuth, getDashboardStats);

export default router;
