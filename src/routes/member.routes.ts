import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { upload } from '../middleware/upload.middleware.js';
import * as memberController from '../controllers/member.controller.js';

const router: Router = Router();

// 成员信息相关路由
router.get('/:id', authenticateToken, memberController.getById);
router.put('/:id', authenticateToken, memberController.updateMember);
router.delete('/:id', authenticateToken, memberController.deleteMember);

// 关系相关路由
router.put('/:id/spouse', authenticateToken, memberController.linkSpouse);

// 图片上传相关路由 (方法改为POST，字段名统一为 'file')
router.post('/:id/avatar', authenticateToken, (upload.single('file') as any), memberController.uploadAvatar as any);
router.post('/:id/photos', authenticateToken, (upload.single('file') as any), memberController.addPhoto as any);

export default router;
