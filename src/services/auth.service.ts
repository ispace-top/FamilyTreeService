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
  avatar?: string;
  created_at: Date;
  updated_at: Date;
}

// 验证用户
export const verifyUser = async (openid: string): Promise<User | null> => {
  const [rows] = await pool.execute<RowDataPacket[]>('SELECT * FROM users WHERE openid = ? LIMIT 1', [openid]);
  return rows.length > 0 ? (rows[0] as User) : null;
};

// 创建用户
export const createUser = async (openid: string, nickname: string, avatar?: string): Promise<User> => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 检查用户是否已存在
    const [existingUsers] = await connection.execute<RowDataPacket[]>('SELECT * FROM users WHERE openid = ? LIMIT 1', [openid]);
    if (existingUsers.length > 0) {
      return existingUsers[0] as User;
    }

    // 创建新用户
    const [result] = await connection.execute<OkPacket>(
      'INSERT INTO users (openid, nickname, avatar_url, created_at) VALUES (?, ?, ?, NOW())',
      [openid, nickname, avatar || null]
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

// 生成令牌
export const generateTokens = async (user: User): Promise<{ token: string; refreshToken: string }> => {
  // 生成访问令牌
  const token = jwt.sign(
    { userId: user.id, openid: user.openid },
    process.env.JWT_SECRET as string,
    { expiresIn: '24h' }
  );

  // 生成刷新令牌
  const refreshToken = jwt.sign(
    { userId: user.id },
    process.env.JWT_REFRESH_SECRET as string,
    { expiresIn: '7d' }
  );

  // 存储刷新令牌
  await pool.execute<OkPacket>(
    'INSERT INTO refresh_tokens (user_id, token, expires_at, created_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY), NOW())',
    [user.id, refreshToken]
  );

  return { token, refreshToken };
};

// 验证刷新令牌
export const verifyRefreshToken = async (refreshToken: string): Promise<User | null> => {
  try {
    // 验证令牌签名
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET as string);
    const userId = (decoded as any).userId;

    // 验证令牌是否存在于数据库
    const [tokenRows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM refresh_tokens WHERE user_id = ? AND token = ? AND expires_at > NOW()',
      [userId, refreshToken]
    );

    if (tokenRows.length === 0) {
      return null;
    }

    // 获取用户信息
    const [userRows] = await pool.execute<RowDataPacket[]>('SELECT * FROM users WHERE id = ?', [userId]);
    return userRows.length > 0 ? (userRows[0] as User) : null;
  } catch (error) {
    return null;
  }
};

// 获取用户详情
export const getUserById = async (userId: number): Promise<User | null> => {
  const [rows] = await pool.execute<RowDataPacket[]>('SELECT * FROM users WHERE id = ? LIMIT 1', [userId]);
  return rows.length > 0 ? (rows[0] as User) : null;
};

// 登出用户
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