import fetch from 'node-fetch';
import * as authService from '../services/auth.service.js';
// 用户登录
export const login = async (req, res) => {
    try {
        const { code, nickname, avatar } = req.body;
        if (!code) {
            res.status(400).json({ message: 'code是必填项' });
            return;
        }
        // 调用微信API获取openid
        const appid = process.env.WECHAT_APPID;
        const secret = process.env.WECHAT_SECRET;
        const response = await fetch(`https://api.weixin.qq.com/sns/jscode2session?appid=${appid}&secret=${secret}&js_code=${code}&grant_type=authorization_code`);
        const data = await response.json();
        if (data.errcode) {
            res.status(400).json({ message: `微信登录失败: ${data.errmsg}` });
            return;
        }
        const openid = data.openid;
        let user = await authService.verifyUser(openid);
        if (!user) {
            user = await authService.createUser(openid, nickname || '', avatar);
        }
        const { token, refreshToken } = await authService.generateTokens(user);
        res.status(200).json({
            message: '登录成功',
            data: {
                user: {
                    id: user.id,
                    openid: user.openid,
                    nickname: user.nickname,
                    avatar: user.avatar
                },
                token,
                refreshToken
            }
        });
    }
    catch (error) {
        console.error('登录失败:', error);
        res.status(500).json({ message: '登录失败，请稍后重试' });
    }
};
// 用户注册
export const register = async (req, res) => {
    try {
        const { openid, nickname, avatar } = req.body;
        if (!openid || !nickname) {
            res.status(400).json({ message: 'openid和nickname是必填项' });
            return;
        }
        const newUser = await authService.createUser(openid, nickname, avatar);
        res.status(201).json({
            message: '注册成功',
            data: {
                id: newUser.id,
                openid: newUser.openid,
                nickname: newUser.nickname,
                avatar: newUser.avatar,
                created_at: newUser.created_at
            }
        });
    }
    catch (error) {
        console.error('注册失败:', error);
        res.status(500).json({ message: '注册失败，请稍后重试' });
    }
};
// 刷新令牌
export const refreshToken = async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            res.status(400).json({ message: 'refreshToken是必填项' });
            return;
        }
        const user = await authService.verifyRefreshToken(refreshToken);
        if (!user) {
            res.status(401).json({ message: '无效的刷新令牌' });
            return;
        }
        const { token: newToken } = await authService.generateTokens(user);
        res.status(200).json({
            message: '令牌刷新成功',
            data: { token: newToken }
        });
    }
    catch (error) {
        console.error('令牌刷新失败:', error);
        res.status(401).json({ message: '刷新令牌无效或已过期' });
    }
};
// 获取当前用户信息
export const getCurrentUser = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ message: '用户未认证' });
            return;
        }
        const user = await authService.getUserById(req.user.userId);
        if (!user) {
            res.status(404).json({ message: '用户不存在' });
            return;
        }
        res.status(200).json({
            message: '获取用户信息成功',
            data: {
                id: user.id,
                openid: user.openid,
                nickname: user.nickname,
                avatar: user.avatar,
                created_at: user.created_at
            }
        });
    }
    catch (error) {
        console.error('获取用户信息失败:', error);
        res.status(500).json({ message: '获取用户信息失败，请稍后重试' });
    }
};
// 用户登出
export const logout = async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (req.user) {
            await authService.logout(req.user.userId, refreshToken);
        }
        res.status(200).json({ message: '登出成功' });
    }
    catch (error) {
        console.error('登出失败:', error);
        res.status(500).json({ message: '登出失败，请稍后重试' });
    }
};
//# sourceMappingURL=auth.controller.js.map