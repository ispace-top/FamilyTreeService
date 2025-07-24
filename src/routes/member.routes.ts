import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware.js';
import * as memberController from '../controllers/member.controller.js';

const router: Router = Router();

// 成员相关路由
router.get('/:id', authenticateToken, memberController.getMemberById);
router.put('/:id', authenticateToken, memberController.updateMember);
router.delete('/:id', authenticateToken, memberController.deleteMember);

export default router;
