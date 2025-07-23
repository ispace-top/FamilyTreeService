import pool from '../config/database.js';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();
// 验证用户
export const verifyUser = async (openid) => {
    const [rows] = await pool.execute('SELECT * FROM users WHERE openid = ? LIMIT 1', [openid]);
    return rows.length > 0 ? rows[0] : null;
};
// 创建用户
export const createUser = async (openid, nickname, avatar) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        // 检查用户是否已存在
        const [existingUsers] = await connection.execute('SELECT * FROM users WHERE openid = ? LIMIT 1', [openid]);
        if (existingUsers.length > 0) {
            return existingUsers[0];
        }
        // 创建新用户
        const [result] = await connection.execute('INSERT INTO users (openid, nickname, avatar, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())', [openid, nickname, avatar || null]);
        const userId = result.insertId;
        const [newUser] = await connection.execute('SELECT * FROM users WHERE id = ?', [userId]);
        await connection.commit();
        return newUser[0];
    }
    catch (error) {
        await connection.rollback();
        throw error;
    }
    finally {
        connection.release();
    }
};
// 生成令牌
export const generateTokens = async (user) => {
    // 生成访问令牌
    const token = jwt.sign({ userId: user.id, openid: user.openid }, process.env.JWT_SECRET, { expiresIn: '24h' });
    // 生成刷新令牌
    const refreshToken = jwt.sign({ userId: user.id }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
    // 存储刷新令牌
    await pool.execute('INSERT INTO refresh_tokens (user_id, token, expires_at, created_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY), NOW())', [user.id, refreshToken]);
    return { token, refreshToken };
};
// 验证刷新令牌
export const verifyRefreshToken = async (refreshToken) => {
    try {
        // 验证令牌签名
        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
        const userId = decoded.userId;
        // 验证令牌是否存在于数据库
        const [tokenRows] = await pool.execute('SELECT * FROM refresh_tokens WHERE user_id = ? AND token = ? AND expires_at > NOW()', [userId, refreshToken]);
        if (tokenRows.length === 0) {
            return null;
        }
        // 获取用户信息
        const [userRows] = await pool.execute('SELECT * FROM users WHERE id = ?', [userId]);
        return userRows.length > 0 ? userRows[0] : null;
    }
    catch (error) {
        return null;
    }
};
// 获取用户详情
export const getUserById = async (userId) => {
    const [rows] = await pool.execute('SELECT * FROM users WHERE id = ? LIMIT 1', [userId]);
    return rows.length > 0 ? rows[0] : null;
};
// 登出用户
export const logout = async (userId, refreshToken) => {
    try {
        if (refreshToken) {
            await pool.execute('DELETE FROM refresh_tokens WHERE user_id = ? AND token = ?', [userId, refreshToken]);
        }
        else {
            await pool.execute('DELETE FROM refresh_tokens WHERE user_id = ?', [userId]);
        }
        return true;
    }
    catch (error) {
        throw error;
    }
};
//# sourceMappingURL=auth.service.js.map