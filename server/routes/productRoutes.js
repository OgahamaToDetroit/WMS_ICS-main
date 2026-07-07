import express from 'express';
import {
  bulkImportProducts,
  createProduct,
  deleteProduct,
  getDashboardStats,
  getProducts,
  updateProduct
} from '../controllers/productController.js';
import { authorizeRoles, verifyAuth } from '../middleware/authMiddleware.js';

const router = express.Router();
router.get('/products', verifyAuth, getProducts);
router.post('/products', verifyAuth, authorizeRoles('Admin', 'Manager'), createProduct);
router.put('/products/:id', verifyAuth, authorizeRoles('Admin', 'Manager'), updateProduct);
router.delete('/products/:id', verifyAuth, authorizeRoles('Admin'), deleteProduct);
router.post('/products/import', verifyAuth, authorizeRoles('Admin', 'Manager'), bulkImportProducts);
router.get('/wms/dashboard-stats', verifyAuth, getDashboardStats);

export default router;
