import { Request, Response } from 'express';
import * as memberService from '../services/member.service.js';
import { userActivityLogger, serverLogger } from '../utils/logger.js';

/**
 * 获取指定成员的详细信息
 */
export const getMemberById = async (req: Request, res: Response): Promise<void> => {
  try {
    const memberId = parseInt(req.params.id, 10);
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ code: 401, message: 'User not authenticated' });
      return;
    }
    if (isNaN(memberId)) {
      res.status(400).json({ code: 400, message: 'Invalid member ID' });
      return;
    }

    const member = await memberService.getMemberById(memberId, userId);
    if (!member) {
      res.status(404).json({ code: 404, message: 'Member not found' });
      return;
    }

    res.status(200).json({
      code: 200,
      message: 'Successfully fetched member details',
      data: member
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('No permission')) {
        res.status(403).json({ code: 403, message: 'No permission to access this member' });
    } else {
        serverLogger.error('Failed to get member details:', error);
        res.status(500).json({ code: 500, message: 'Failed to get member details' });
    }
  }
};

/**
 * 更新指定成员的信息
 */
export const updateMember = async (req: Request, res: Response): Promise<void> => {
  try {
    const memberId = parseInt(req.params.id, 10);
    const userId = req.user?.userId;
    const memberData = req.body;

    if (!userId) {
      res.status(401).json({ code: 401, message: 'User not authenticated' });
      return;
    }
    if (isNaN(memberId)) {
      res.status(400).json({ code: 400, message: 'Invalid member ID' });
      return;
    }

    const updatedMember = await memberService.updateMember(memberId, userId, memberData);
    if (!updatedMember) {
      res.status(404).json({ code: 404, message: 'Member not found or no permission to update' });
      return;
    }

    userActivityLogger.info({ userId, action: 'update_member', memberId });
    res.status(200).json({
      code: 200,
      message: 'Member information updated successfully',
      data: updatedMember
    });
  } catch (error) {
    serverLogger.error('Failed to update member:', error);
    res.status(500).json({ code: 500, message: 'Failed to update member information' });
  }
};

/**
 * 删除指定成员
 */
export const deleteMember = async (req: Request, res: Response): Promise<void> => {
  try {
    const memberId = parseInt(req.params.id, 10);
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ code: 401, message: 'User not authenticated' });
      return;
    }
    if (isNaN(memberId)) {
      res.status(400).json({ code: 400, message: 'Invalid member ID' });
      return;
    }
    const success = await memberService.deleteMember(memberId, userId);
    if (!success) {
      res.status(404).json({ code: 404, message: 'Member not found or no permission to delete' });
      return;
    }

    userActivityLogger.info({ userId, action: 'delete_member', memberId });
    res.status(200).json({ code: 200, message: 'Member deleted successfully' });
  } catch (error) {
    serverLogger.error('Failed to delete member:', error);
    res.status(500).json({ code: 500, message: 'Failed to delete member' });
  }
};
