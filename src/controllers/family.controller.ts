import { Request, Response } from 'express';
import * as familyService from '../services/family.service.js';
import * as memberService from '../services/member.service.js';
import uploadService from '../services/upload.service.js';
import { userActivityLogger, serverLogger } from '../utils/logger.js';

/**
 * 创建新家族
 */
export const createFamily = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ code: 401, message: 'User not authenticated' });
      return;
    }
    if (!name) {
      res.status(400).json({ code: 400, message: 'Family name is required' });
      return;
    }

    const family = await familyService.createFamily(userId, name, description);
    userActivityLogger.info({ userId, action: 'create_family', familyId: family.id, familyName: name });
    res.status(201).json({
      code: 201,
      message: 'Family created successfully',
      data: family
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('more than')) {
      res.status(403).json({ code: 403, message: error.message });
    } else {
      serverLogger.error('Failed to create family:', error);
      res.status(500).json({ code: 500, message: 'Failed to create family, please try again later' });
    }
  }
};

/**
 * 获取指定家族的详情
 */
export const getFamilyById = async (req: Request, res: Response): Promise<void> => {
  try {
    const familyId = parseInt(req.params.id, 10);
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ code: 401, message: 'User not authenticated' });
      return;
    }
    if (isNaN(familyId)) {
      res.status(400).json({ code: 400, message: 'Invalid family ID' });
      return;
    }

    const family = await familyService.getFamilyById(familyId, userId);
    if (!family) {
      res.status(404).json({ code: 404, message: 'Family not found or no permission to access' });
      return;
    }

    res.status(200).json({
      code: 200,
      message: 'Successfully fetched family details',
      data: family
    });
  } catch (error) {
    serverLogger.error('Failed to get family details:', error);
    res.status(500).json({ code: 500, message: 'Failed to get family details, please try again later' });
  }
};

/**
 * 更新家族信息
 */
export const updateFamily = async (req: Request, res: Response): Promise<void> => {
  try {
    const familyId = parseInt(req.params.id, 10);
    const userId = req.user?.userId;
    const { name, description } = req.body;

    if (!userId) {
      res.status(401).json({ code: 401, message: 'User not authenticated' });
      return;
    }
    if (isNaN(familyId)) {
      res.status(400).json({ code: 400, message: 'Invalid family ID' });
      return;
    }

    const updatedFamily = await familyService.updateFamily(familyId, userId, { name, description });
    if (!updatedFamily) {
      res.status(404).json({ code: 404, message: 'Family not found or no permission to update' });
      return;
    }
    userActivityLogger.info({ userId, action: 'update_family', familyId });
    res.status(200).json({
      code: 200,
      message: 'Family information updated successfully',
      data: updatedFamily
    });
  } catch (error) {
    serverLogger.error('Failed to update family:', error);
    res.status(500).json({ code: 500, message: 'Failed to update family information' });
  }
};

/**
 * 删除家族
 */
export const deleteFamily = async (req: Request, res: Response): Promise<void> => {
  try {
    const familyId = parseInt(req.params.id, 10);
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ code: 401, message: 'User not authenticated' });
      return;
    }
    if (isNaN(familyId)) {
      res.status(400).json({ code: 400, message: 'Invalid family ID' });
      return;
    }

    const success = await familyService.deleteFamily(familyId, userId);
    if (!success) {
      res.status(404).json({ code: 404, message: 'Family not found or no permission to delete' });
      return;
    }

    userActivityLogger.info({ userId, action: 'delete_family', familyId });
    res.status(200).json({ code: 200, message: 'Family deleted successfully' });
  } catch (error) {
    serverLogger.error('Failed to delete family:', error);
    res.status(500).json({ code: 500, message: 'Failed to delete family' });
  }
};

/**
 * 获取当前用户的所有家族
 */
export const getUserFamilies = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ code: 401, message: 'User not authenticated' });
      return;
    }

    const families = await familyService.getUserFamilies(userId);
    serverLogger.info(`[getUserFamilies] Returning data for userId: ${userId}`, { data: families });
    res.status(200).json({
      code: 200,
      message: 'Successfully fetched user families',
      data: families
    });
  } catch (error) {
    serverLogger.error('Failed to get user families:', error);
    res.status(500).json({ code: 500, message: 'Failed to get user families' });
  }
};

/**
 * 获取家族的树状结构
 */
export const getFamilyTree = async (req: Request, res: Response): Promise<void> => {
  try {
    const familyId = parseInt(req.params.id, 10);
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ code: 401, message: 'User not authenticated' });
      return;
    }
    if (isNaN(familyId)) {
      res.status(400).json({ code: 400, message: 'Invalid family ID' });
      return;
    }

    const familyTree = await familyService.getFamilyTree(familyId, userId);
    serverLogger.info(`[getFamilyTree] Returning data for familyId: ${familyId}, userId: ${userId}`, { data: familyTree });
    res.status(200).json({
      code: 200,
      message: 'Successfully fetched family tree',
      data: familyTree
    });
  } catch (error) {
    serverLogger.error('Failed to get family tree:', error);
    res.status(500).json({ code: 500, message: 'Failed to get family tree' });
  }
};

/**
 * 获取家族的所有成员列表 (用于搜索)
 */
export const getFamilyMembers = async (req: Request, res: Response): Promise<void> => {
  try {
    const familyId = parseInt(req.params.familyId, 10);
    const userId = req.user?.userId;
    const searchName = req.query.search as string;

    if (!userId) {
      res.status(401).json({ code: 401, message: 'User not authenticated' });
      return;
    }
    if (isNaN(familyId)) {
      res.status(400).json({ code: 400, message: 'Invalid family ID' });
      return;
    }

    const members = await familyService.getFamilyMembers(familyId, userId, searchName);
    res.status(200).json({
      code: 200,
      message: 'Successfully fetched family members',
      data: members
    });
  } catch (error) {
    serverLogger.error('Failed to get family members:', error);
    res.status(500).json({ code: 500, message: 'Failed to get family members' });
  }
};

/**
 * 向指定家族添加新成员
 */
export const addFamilyMember = async (req: Request, res: Response): Promise<void> => {
  try {
    const familyId = parseInt(req.params.familyId, 10);
    const userId = req.user?.userId;
    const memberData = req.body;

    if (!userId) {
      res.status(401).json({ code: 401, message: 'User not authenticated' });
      return;
    }
    if (isNaN(familyId)) {
      res.status(400).json({ code: 400, message: 'Invalid family ID' });
      return;
    }
    if (!memberData.name || !memberData.gender) {
      res.status(400).json({ code: 400, message: 'Member name and gender are required' });
      return;
    }

    const newMember = await memberService.addMember(familyId, userId, memberData);
    if (!newMember) {
      res.status(403).json({ code: 403, message: 'No permission to add member' });
      return;
    }

    userActivityLogger.info({ userId, action: 'add_member', familyId, memberId: newMember.id });
    res.status(201).json({
      code: 201,
      message: 'Member added successfully',
      data: newMember
    });
  } catch (error) {
    serverLogger.error('Failed to add member to family:', error);
    res.status(500).json({ code: 500, message: 'Failed to add member' });
  }
};

/**
 * 创建邀请链接
 */
export const createInvitation = async (req: Request, res: Response): Promise<void> => {
  try {
    const familyId = parseInt(req.params.id, 10);
    const inviterId = req.user?.userId;

    if (!inviterId) {
      res.status(401).json({ code: 401, message: 'User not authenticated' });
      return;
    }

    const invitation = await familyService.createInvitation(familyId, inviterId);
    res.status(201).json({
      code: 201,
      message: 'Invitation created successfully',
      data: invitation
    });
  } catch (error) {
    serverLogger.error('Failed to create invitation:', error);
    res.status(500).json({ code: 500, message: 'Failed to create invitation' });
  }
};

/**
 * 接受邀请
 */
export const acceptInvitation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ code: 401, message: 'User not authenticated' });
      return;
    }

    const result = await familyService.acceptInvitation(token, userId);
    res.status(200).json({
      code: 200,
      message: 'Successfully joined the family',
      data: result
    });
  } catch (error) {
    serverLogger.error('Failed to accept invitation:', error);
    if (error instanceof Error) {
      res.status(400).json({ code: 400, message: error.message });
    } else {
      res.status(500).json({ code: 500, message: 'An unknown error occurred' });
    }
  }
};

/**
 * 认领成员
 */
export const claimMember = async (req: Request, res: Response): Promise<void> => {
  try {
    const familyId = parseInt(req.params.familyId, 10);
    const userId = req.user?.userId;
    const { memberId } = req.body;

    if (!userId) {
      res.status(401).json({ code: 401, message: 'User not authenticated' });
      return;
    }
    if (!memberId) {
      res.status(400).json({ code: 400, message: 'Member ID is required for claiming' });
      return;
    }

    await familyService.claimMember(familyId, userId, memberId);
    userActivityLogger.info({ userId, action: 'claim_member', familyId, memberId });
    res.status(200).json({ code: 200, message: 'Member claimed successfully' });

  } catch (error) {
    serverLogger.error('Failed to claim member:', error);
    if (error instanceof Error) {
      res.status(400).json({ code: 400, message: error.message });
    } else {
      res.status(500).json({ code: 500, message: 'An unknown error occurred' });
    }
  }
};

/**
 * 获取家族成员角色列表 (用于成员管理)
 */
export const getFamilyRoles = async (req: Request, res: Response): Promise<void> => {
  try {
    const familyId = parseInt(req.params.id, 10);
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ code: 401, message: 'User not authenticated' });
      return;
    }

    const roles = await familyService.getFamilyRoles(familyId, userId);
    res.status(200).json({
      code: 200,
      message: 'Successfully fetched family roles',
      data: roles
    });
  } catch (error) {
    serverLogger.error('Failed to get family roles:', error);
    if (error instanceof Error && error.message.includes('permission')) {
      res.status(403).json({ code: 403, message: error.message });
    } else {
      res.status(500).json({ code: 500, message: 'Failed to get family roles' });
    }
  }
};

/**
 * 更新家族成员的角色
 */
export const updateMemberRole = async (req: Request, res: Response): Promise<void> => {
  try {
    const familyId = parseInt(req.params.familyId, 10);
    const memberUserId = parseInt(req.params.userId, 10); // 注意：这里是被操作用户的 user ID
    const { role } = req.body;
    const operatorId = req.user?.userId;

    if (!operatorId) {
      res.status(401).json({ code: 401, message: 'User not authenticated' });
      return;
    }
    if (!role || !['admin', 'editor', 'member'].includes(role)) {
      res.status(400).json({ code: 400, message: 'Invalid role provided' });
      return;
    }

    await familyService.updateMemberRole(familyId, operatorId, memberUserId, role);

    userActivityLogger.info({ operatorId, action: 'update_member_role', familyId, targetUserId: memberUserId, newRole: role });
    res.status(200).json({ code: 200, message: 'Member role updated successfully' });

  } catch (error) {
    serverLogger.error('Failed to update member role:', error);
    if (error instanceof Error) {
      res.status(403).json({ code: 403, message: error.message });
    } else {
      res.status(500).json({ code: 500, message: 'An unknown error occurred' });
    }
  }
};



/**
 * 上传/更新家族头像
 */
export const uploadAvatar = async (req: Request, res: Response): Promise<void> => {
  try {
    const familyId = parseInt(req.params.id, 10);
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ code: 401, message: 'User not authenticated' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ code: 400, message: 'No file uploaded' });
      return;
    }

    const uploadResult = await uploadService.uploadFile(req.file);
    if (!uploadResult.success || !uploadResult.url) {
      res.status(500).json({ code: 500, message: uploadResult.error || 'Failed to upload file' });
      return;
    }

    const updatedFamily = await familyService.updateFamilyAvatar(familyId, userId, uploadResult.url);

    if (!updatedFamily) {
      res.status(403).json({ code: 403, message: 'Permission denied or family not found' });
      return;
    }

    userActivityLogger.info({ userId, action: 'upload_family_avatar', familyId });
    res.status(200).json({
      code: 200,
      message: 'Family avatar updated successfully',
      data: { url: uploadResult.url } // <-- 修正：直接返回上传的URL
    });
  } catch (error) {
    serverLogger.error('Failed to upload family avatar:', error);
    res.status(500).json({ code: 500, message: 'Failed to upload family avatar' });
  }
};

/**
 * 上传/更新家族背景图
 */
export const uploadBanner = async (req: Request, res: Response): Promise<void> => {
  try {
    const familyId = parseInt(req.params.id, 10);
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ code: 401, message: 'User not authenticated' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ code: 400, message: 'No file uploaded' });
      return;
    }

    const uploadResult = await uploadService.uploadFile(req.file);
    if (!uploadResult.success || !uploadResult.url) {
      res.status(500).json({ code: 500, message: uploadResult.error || 'Failed to upload file' });
      return;
    }

    const updatedFamily = await familyService.updateFamilyBanner(familyId, userId, uploadResult.url);

    if (!updatedFamily) {
      res.status(403).json({ code: 403, message: 'Permission denied or family not found' });
      return;
    }
    
    userActivityLogger.info({ userId, action: 'upload_family_banner', familyId });
    res.status(200).json({
      code: 200,
      message: 'Family banner updated successfully',
      data: { url: uploadResult.url } // <-- 修正：直接返回上传的URL
    });
  } catch (error) {
    serverLogger.error('Failed to upload family banner:', error);
    res.status(500).json({ code: 500, message: 'Failed to upload family banner' });
  }
};

