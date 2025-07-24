import { Request, Response } from 'express';
import * as memberService from '../services/member.service.js';
import uploadService from '../services/upload.service.js';
import { userActivityLogger, serverLogger } from '../utils/logger.js';

/**
 * 获取指定成员的详细信息
 */
export const getById = async (req: Request, res: Response): Promise<void> => {
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


/**
 * 关联配偶
 */
export const linkSpouse = async (req: Request, res: Response): Promise<void> => {
    try {
        const memberId = parseInt(req.params.id, 10);
        const { spouseId } = req.body;
        const userId = req.user?.userId;

        if (!userId) {
            res.status(401).json({ code: 401, message: 'User not authenticated' });
            return;
        }
        if (!spouseId) {
            res.status(400).json({ code: 400, message: 'Spouse ID is required' });
            return;
        }

        const success = await memberService.linkSpouse(memberId, spouseId, userId);

        if (success) {
            userActivityLogger.info({ userId, action: 'link_spouse', memberId, spouseId });
            res.status(200).json({ code: 200, message: 'Spouse linked successfully' });
        } else {
            res.status(400).json({ code: 400, message: 'Failed to link spouse' });
        }
    } catch (error) {
        serverLogger.error('Failed to link spouse:', error);
        if (error instanceof Error) {
            res.status(400).json({ code: 400, message: error.message });
        } else {
            res.status(500).json({ code: 500, message: 'An unknown error occurred while linking spouse' });
        }
    }
};

/**
 * 上传/更新成员头像
 */
export const uploadAvatar = async (req: Request, res: Response): Promise<void> => {
  try {
    const memberId = parseInt(req.params.id, 10);
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

    const newAvatarUrl = await memberService.updateMemberAvatar(memberId, userId, uploadResult.url);

    if (!newAvatarUrl) {
      res.status(403).json({ code: 403, message: 'Permission denied or member not found' });
      return;
    }

    userActivityLogger.info({ userId, action: 'upload_member_avatar', memberId });
    res.status(200).json({
      code: 200,
      message: 'Member avatar updated successfully',
      data: { url: uploadResult.url } // <-- 修正：直接返回上传的URL
    });
  } catch (error) {
    serverLogger.error('Failed to upload member avatar:', error);
    res.status(500).json({ code: 500, message: 'Failed to upload member avatar' });
  }
};

/**
 * 为成员添加照片
 */
export const addPhoto = async (req: Request, res: Response): Promise<void> => {
  try {
    const memberId = parseInt(req.params.id, 10);
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

    await memberService.addMemberPhoto(memberId, userId, uploadResult.url);

    userActivityLogger.info({ userId, action: 'add_member_photo', memberId });
    res.status(200).json({
      code: 200,
      message: 'Photo added successfully',
      data: { url: uploadResult.url } // <-- 修正：返回新上传照片的URL
    });
  } catch (error) {
    serverLogger.error('Failed to add member photo:', error);
    if (error instanceof Error && error.message.includes('Permission denied')) {
        res.status(403).json({ code: 403, message: error.message });
    } else {
        res.status(500).json({ code: 500, message: 'Failed to add member photo' });
    }
  }
};

