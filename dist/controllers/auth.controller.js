import * as authService from '../services/auth.service.js';
// 用户登录
export const login = async (req, res) => {
    try {
        const { openid, nickname, avatar } = req.body;
        if (!openid) {
            res.status(400).json({ message: 'openid是必填项' });
            return;
        }
        const { user, token, refreshToken } = await authService.login(openid, nickname, avatar);
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
        const newUser = await authService.register(openid, nickname, avatar);
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
        const newToken = await authService.refreshToken(refreshToken);
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
        await authService.logout(refreshToken);
        res.status(200).json({ message: '登出成功' });
    }
    catch (error) {
        console.error('登出失败:', error);
        res.status(500).json({ message: '登出失败，请稍后重试' });
    }
};
//# sourceMappingURL=auth.controller.js.map