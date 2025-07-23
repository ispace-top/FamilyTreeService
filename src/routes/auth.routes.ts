import { Router } from 'express';
import { login, register, refreshToken, getCurrentUser, logout } from '../controllers/auth.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';

const router = Router();

// 公开路由
router.post('/login', login);
router.post('/register', register);
router.post('/refresh-token', refreshToken);

// 需要认证的路由
router.get('/current-user', authenticateToken, getCurrentUser);
router.post('/logout', authenticateToken, logout);

export default router;