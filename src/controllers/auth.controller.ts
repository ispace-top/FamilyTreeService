import { Request, Response } from 'express';
import fetch from 'node-fetch';
import * as authService from '../services/auth.service.js';
import { userActivityLogger, serverLogger } from '../utils/logger.js';

// 微信 code2Session API 的响应接口
interface Code2SessionResponse {
  openid: string;
  session_key: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
}

/**
 * 用户登录或注册
 * 接收小程序的 code，换取 openid，然后创建或更新用户信息，最后返回 JWT
 */
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, nickname, avatar } = req.body;

    if (!code) {
      res.status(400).json({ code: 400, message: 'code is required' });
      return;
    }

    // 1. 调用微信API换取 openid
    const appid = process.env.WECHAT_APPID;
    const secret = process.env.WECHAT_SECRET;
    const response = await fetch(`https://api.weixin.qq.com/sns/jscode2session?appid=${appid}&secret=${secret}&js_code=${code}&grant_type=authorization_code`);
    
    if (!response.ok) {
        throw new Error(`WeChat API request failed with status ${response.status}`);
    }

    const data = await response.json() as Code2SessionResponse;

    if (data.errcode) {
      serverLogger.error('WeChat login error:', data);
      res.status(400).json({ code: 400, message: `WeChat login failed: ${data.errmsg}` });
      return;
    }

    const openid = data.openid;

    // 2. 创建或更新用户信息
    const user = await authService.createUser(openid, nickname || '微信用户', avatar);
    
    // 3. 生成并返回令牌
    const { token, refreshToken } = await authService.generateTokens(user);
    userActivityLogger.info({ userId: user.id, action: 'login', timestamp: new Date().toISOString() });
    
    res.status(200).json({
      code: 200,
      message: 'Login successful',
      data: {
        token,
        refreshToken,
        user: {
          id: user.id,
          nickname: user.nickname,
          avatar_url: user.avatar_url,
        },
      },
    });
  } catch (error) {
    serverLogger.error('Login process failed:', error);
    res.status(500).json({ code: 500, message: 'Login failed, please try again later' });
  }
};


/**
 * 刷新访问令牌
 */
export const refreshToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({ code: 400, message: 'refreshToken is required' });
      return;
    }

    const user = await authService.verifyRefreshToken(refreshToken);
    if (!user) {
      res.status(401).json({ code: 401, message: 'Invalid or expired refresh token' });
      return;
    }

    const { token: newToken } = await authService.generateTokens(user);

    res.status(200).json({
      code: 200,
      message: 'Token refreshed successfully',
      data: { token: newToken }
    });
  } catch (error) {
    serverLogger.error('Token refresh failed:', error);
    res.status(500).json({ code: 500, message: 'Failed to refresh token' });
  }
};

/**
 * 获取当前登录用户信息
 */
export const getCurrentUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ code: 401, message: 'User not authenticated' });
      return;
    }

    const user = await authService.getUserById(userId);
    if (!user) {
      res.status(404).json({ code: 404, message: 'User not found' });
      return;
    }

    res.status(200).json({
      code: 200,
      message: 'Successfully fetched user information',
      data: {
        id: user.id,
        nickname: user.nickname,
        avatar_url: user.avatar_url
      }
    });
  } catch (error) {
    serverLogger.error('Failed to get current user:', error);
    res.status(500).json({ code: 500, message: 'Failed to get user information' });
  }
};

/**
 * 用户登出
 */
export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const { refreshToken } = req.body;

    if (userId) {
      await authService.logout(userId, refreshToken);
      userActivityLogger.info({ userId, action: 'logout', timestamp: new Date().toISOString() });
    }

    res.status(200).json({ code: 200, message: 'Logout successful' });
  } catch (error) {
    serverLogger.error('Logout failed:', error);
    res.status(500).json({ code: 500, message: 'Logout failed' });
  }
};
