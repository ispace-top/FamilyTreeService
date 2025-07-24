import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware.js';
import * as familyController from '../controllers/family.controller.js';

const router: Router = Router();

// 家族相关路由
router.post('/', authenticateToken, familyController.createFamily);
router.get('/my-families', authenticateToken, familyController.getUserFamilies); // 路由路径优化
router.get('/:id', authenticateToken, familyController.getFamilyById);
router.put('/:id', authenticateToken, familyController.updateFamily);
router.delete('/:id', authenticateToken, familyController.deleteFamily);
router.get('/:id/tree', authenticateToken, familyController.getFamilyTree);

// 成员相关子路由
router.get('/:familyId/members', authenticateToken, familyController.getFamilyMembers);
router.post('/:familyId/members', authenticateToken, familyController.addFamilyMember);

// --- 新增: 权限管理路由 ---
router.put('/:familyId/users/:userId/role', authenticateToken, familyController.updateMemberRole);

// --- 新增: 邀请路由 ---
router.post('/:familyId/invitations', authenticateToken, familyController.createInvitation);
router.post('/invitations/accept', authenticateToken, familyController.acceptInvitation);

export default router;
