import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { upload } from '../middleware/upload.middleware.js';
import * as familyController from '../controllers/family.controller.js';

const router: Router = Router();

// 家族基本信息
router.post('/', authenticateToken, familyController.createFamily);
router.get('/my-families', authenticateToken, familyController.getUserFamilies);
router.get('/:id', authenticateToken, familyController.getFamilyById);
router.put('/:id', authenticateToken, familyController.updateFamily);
router.delete('/:id', authenticateToken, familyController.deleteFamily);
router.get('/:id/tree', authenticateToken, familyController.getFamilyTree);

// 家族成员
router.get('/:familyId/members', authenticateToken, familyController.getFamilyMembers);
router.post('/:familyId/members', authenticateToken, familyController.addFamilyMember);

// 成员管理与权限
router.get('/:familyId/roles', authenticateToken, familyController.getFamilyRoles);
router.put('/:familyId/users/:userId/role', authenticateToken, familyController.updateMemberRole);

// 邀请
router.post('/:familyId/invitations', authenticateToken, familyController.createInvitation);
router.post('/invitations/accept', authenticateToken, familyController.acceptInvitation);

// 认领
router.put('/:familyId/claim-member', authenticateToken, familyController.claimMember);

// 家族图片上传 (方法改为POST，字段名统一为 'file')
router.post('/:id/avatar', authenticateToken, (upload.single('file') as any), familyController.uploadAvatar as any);
router.post('/:id/banner', authenticateToken, (upload.single('file') as any), familyController.uploadBanner as any);

export default router;
