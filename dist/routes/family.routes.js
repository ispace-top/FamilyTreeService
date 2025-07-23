import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware.js';
import * as familyController from '../controllers/family.controller.js';
const router = Router();
// 家族相关路由
router.post('/', authenticateToken, familyController.createFamily);
router.get('/:id', authenticateToken, familyController.getFamilyById);
router.put('/:id', authenticateToken, familyController.updateFamily);
router.delete('/:id', authenticateToken, familyController.deleteFamily);
router.get('/user/families', authenticateToken, familyController.getUserFamilies);
router.get('/:familyId/members', authenticateToken, familyController.getFamilyMembers);
router.post('/:familyId/members', authenticateToken, familyController.addFamilyMember);
router.get('/:id/tree', authenticateToken, familyController.getFamilyTree);
export default router;
//# sourceMappingURL=family.routes.js.map