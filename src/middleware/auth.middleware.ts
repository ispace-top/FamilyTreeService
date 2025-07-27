import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: number;
        openid: string;
        role?: string;
      };
    }
  }
}

// JWT认证中间件
export const authenticateToken = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    res.status(401).json({ message: '未提供认证令牌' });
    return;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string);
    req.user = decoded as { userId: number; openid: string; role?: string };
    next();
  } catch (error) {
    console.error('JWT验证失败:', error);
    res.status(403).json({ message: '无效的令牌或令牌已过期' });
  }
};

// 角色权限验证中间件
export const authorizeRoles = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: '需要先进行认证' });
      return;
    }

    // 在实际应用中，这里应该从数据库或缓存中获取用户角色
    // 简化实现：假设用户角色存储在req.user.role中
    const userRole = req.user.role as string;

    if (!roles.includes(userRole)) {
      res.status(403).json({ message: '没有足够的权限执行此操作' });
      return;
    }

    next();
  };
};