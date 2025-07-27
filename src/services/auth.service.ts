import pool from '../config/database.js';
import * as bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { RowDataPacket, OkPacket } from 'mysql2/promise';

dotenv.config();

// 用户数据模型接口
export interface User {
  id: number;
  openid: string;
  nickname?: string;
  avatar_url?: string;
  created_at: Date;
  updated_at?: Date;
}

// 验证用户
export const verifyUser = async (openid: string): Promise<User | null> => {
  const [rows] = await pool.execute<RowDataPacket[]>('SELECT * FROM users WHERE openid = ? LIMIT 1', [openid]);
  return rows.length > 0 ? (rows[0] as User) : null;
};

// 创建或更新用户
export const createUser = async (openid: string, nickname: string, avatarUrl?: string): Promise<User> => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 检查用户是否已存在
    const [existingUsers] = await connection.execute<RowDataPacket[]>('SELECT * FROM users WHERE openid = ? LIMIT 1', [openid]);
    if (existingUsers.length > 0) {
      const existingUser = existingUsers[0];
      // 如果用户已存在，更新其信息和最后登录时间
      await connection.execute(
        'UPDATE users SET nickname = ?, avatar_url = ?, last_login_time = NOW() WHERE id = ?',
        [nickname || existingUser.nickname, avatarUrl || existingUser.avatar_url, existingUser.id]
      );
      const [updatedUser] = await connection.execute<RowDataPacket[]>('SELECT * FROM users WHERE id = ?', [existingUser.id]);
      await connection.commit();
      return updatedUser[0] as User;
    }

    // 如果用户不存在，则创建新用户
    const [result] = await connection.execute<OkPacket>(
      'INSERT INTO users (openid, nickname, avatar_url, created_at, last_login_time) VALUES (?, ?, ?, NOW(), NOW())',
      [openid, nickname, avatarUrl || null]
    );

    const userId = result.insertId;
    const [newUser] = await connection.execute<RowDataPacket[]>('SELECT * FROM users WHERE id = ?', [userId]);

    await connection.commit();
    return newUser[0] as User;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

// 生成令牌 (已优化: 使用 ON DUPLICATE KEY UPDATE 简化刷新令牌存储)
export const generateTokens = async (user: User): Promise<{ token: string; refreshToken: string }> => {
  const token = jwt.sign(
    { userId: user.id, openid: user.openid },
    process.env.JWT_SECRET as string,
    { expiresIn: '24h' }
  );

  const refreshToken = jwt.sign(
    { userId: user.id },
    process.env.JWT_REFRESH_SECRET as string,
    { expiresIn: '7d' }
  );

  // 存储或更新刷新令牌
  await pool.execute<OkPacket>(
    'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY)) ON DUPLICATE KEY UPDATE token = VALUES(token), expires_at = VALUES(expires_at)',
    [user.id, refreshToken]
  );

  return { token, refreshToken };
};

// 验证刷新令牌
export const verifyRefreshToken = async (refreshToken: string): Promise<User | null> => {
  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET as string);
    const userId = (decoded as any).userId;

    const [tokenRows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM refresh_tokens WHERE user_id = ? AND token = ? AND expires_at > NOW()',
      [userId, refreshToken]
    );

    if (tokenRows.length === 0) {
      return null;
    }

    const [userRows] = await pool.execute<RowDataPacket[]>('SELECT * FROM users WHERE id = ?', [userId]);
    return userRows.length > 0 ? (userRows[0] as User) : null;
  } catch (error) {
    return null;
  }
};

// 通过ID获取用户
export const getUserById = async (userId: number): Promise<User | null> => {
  const [rows] = await pool.execute<RowDataPacket[]>('SELECT * FROM users WHERE id = ? LIMIT 1', [userId]);
  return rows.length > 0 ? (rows[0] as User) : null;
};

// 登出 (通过删除刷新令牌实现)
export const logout = async (userId: number, refreshToken?: string): Promise<boolean> => {
  try {
    if (refreshToken) {
      await pool.execute('DELETE FROM refresh_tokens WHERE user_id = ? AND token = ?', [userId, refreshToken]);
    } else {
      await pool.execute('DELETE FROM refresh_tokens WHERE user_id = ?', [userId]);
    }
    return true;
  } catch (error) {
    throw error;
  }
};
