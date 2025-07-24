import { Request, Response } from 'express';
import * as familyService from '../services/family.service.js';
import * as memberService from '../services/member.service.js';
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
    serverLogger.error('Failed to create family:', error);
    res.status(500).json({ code: 500, message: 'Failed to create family, please try again later' });
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
 * 获取家族的所有成员列表
 */
export const getFamilyMembers = async (req: Request, res: Response): Promise<void> => {
  try {
    const familyId = parseInt(req.params.familyId, 10);
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ code: 401, message: 'User not authenticated' });
      return;
    }
    if (isNaN(familyId)) {
      res.status(400).json({ code: 400, message: 'Invalid family ID' });
      return;
    }

    const members = await familyService.getFamilyMembers(familyId, userId);
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
