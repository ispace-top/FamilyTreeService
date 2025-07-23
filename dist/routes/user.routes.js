import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { getUserFamilies } from '../controllers/family.controller.js';
const router = Router();
/**
 * @route GET /families
 * @desc 获取用户所有家族
 * @access Private
 */
router.get('/families', authenticateToken, getUserFamilies);
export default router;
//# sourceMappingURL=user.routes.js.map