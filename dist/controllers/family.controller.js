import * as familyService from '../services/family.service.js';
// 创建家族
export const createFamily = async (req, res) => {
    try {
        const { name, description } = req.body;
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ message: '用户未认证' });
            return;
        }
        if (!name) {
            res.status(400).json({ message: '家族名称是必填项' });
            return;
        }
        const family = await familyService.createFamily(userId, name, description);
        res.status(201).json({
            code: 201,
            message: '家族创建成功',
            data: family
        });
    }
    catch (error) {
        console.error('创建家族失败:', error);
        res.status(500).json({ message: '创建家族失败，请稍后重试' });
    }
};
// 获取家族详情
export const getFamilyById = async (req, res) => {
    try {
        const familyId = parseInt(req.params.id, 10);
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ message: '用户未认证' });
            return;
        }
        if (isNaN(familyId)) {
            res.status(400).json({ message: '无效的家族ID' });
            return;
        }
        const family = await familyService.getFamilyById(familyId, userId);
        if (!family) {
            res.status(404).json({ message: '家族不存在或无权访问' });
            return;
        }
        res.status(200).json({
            code: 200,
            message: '获取家族详情成功',
            data: family
        });
    }
    catch (error) {
        console.error('获取家族详情失败:', error);
        res.status(500).json({ message: '获取家族详情失败，请稍后重试' });
    }
};
// 更新家族信息
export const updateFamily = async (req, res) => {
    try {
        const familyId = parseInt(req.params.id, 10);
        const userId = req.user?.userId;
        const { name, description } = req.body;
        if (!userId) {
            res.status(401).json({ message: '用户未认证' });
            return;
        }
        if (isNaN(familyId)) {
            res.status(400).json({ message: '无效的家族ID' });
            return;
        }
        const updatedFamily = await familyService.updateFamily(familyId, userId, { name, description });
        if (!updatedFamily) {
            res.status(404).json({ message: '家族不存在或无权更新' });
            return;
        }
        res.status(200).json({
            code: 200,
            message: '更新家族信息成功',
            data: updatedFamily
        });
    }
    catch (error) {
        console.error('更新家族信息失败:', error);
        res.status(500).json({ message: '更新家族信息失败，请稍后重试' });
    }
};
// 获取用户家族列表
export const getUserFamilies = async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ code: 401, message: '用户未认证' });
            return;
        }
        const families = await familyService.getUserFamilies(userId);
        res.status(200).json({
            code: 200,
            message: '获取用户家族列表成功',
            data: families
        });
    }
    catch (error) {
        console.error('获取用户家族列表失败:', error);
        res.status(500).json({ code: 500, message: '获取用户家族列表失败，请稍后重试' });
    }
};
// 删除家族
export const deleteFamily = async (req, res) => {
    try {
        const familyId = parseInt(req.params.id, 10);
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ message: '用户未认证' });
            return;
        }
        if (isNaN(familyId)) {
            res.status(400).json({ message: '无效的家族ID' });
            return;
        }
        const result = await familyService.deleteFamily(familyId, userId);
        if (!result) {
            res.status(404).json({ message: '家族不存在或无权删除' });
            return;
        }
        res.status(200).json({
            code: 200,
            message: '家族删除成功'
        });
    }
    catch (error) {
        console.error('删除家族失败:', error);
        res.status(500).json({ message: '删除家族失败，请稍后重试' });
    }
};
// 获取家族成员列表
export const getFamilyMembers = async (req, res) => {
    try {
        const familyId = parseInt(req.params.familyId, 10);
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ message: '用户未认证' });
            return;
        }
        if (isNaN(familyId)) {
            res.status(400).json({ message: '无效的家族ID' });
            return;
        }
        const members = await familyService.getFamilyMembers(familyId, userId);
        res.status(200).json({
            code: 200,
            message: '获取家族成员列表成功',
            data: members
        });
    }
    catch (error) {
        console.error('获取家族成员列表失败:', error);
        res.status(500).json({ message: '获取家族成员列表失败，请稍后重试' });
    }
};
// 添加家族成员
export const addFamilyMember = async (req, res) => {
    try {
        const familyId = parseInt(req.params.familyId, 10);
        const userId = req.user?.userId;
        const memberData = req.body;
        if (!userId) {
            res.status(401).json({ message: '用户未认证' });
            return;
        }
        if (isNaN(familyId)) {
            res.status(400).json({ message: '无效的家族ID' });
            return;
        }
        const newMember = await familyService.addFamilyMember(familyId, userId, memberData);
        if (!newMember) {
            res.status(403).json({ message: '没有添加成员的权限' });
            return;
        }
        res.status(201).json({
            code: 201,
            message: '添加家族成员成功',
            data: newMember
        });
    }
    catch (error) {
        console.error('添加家族成员失败:', error);
        res.status(500).json({ message: '添加家族成员失败，请稍后重试' });
    }
};
// 获取家族树结构
export const getFamilyTree = async (req, res) => {
    try {
        const familyId = parseInt(req.params.id, 10);
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ code: 401, message: '用户未认证' });
            return;
        }
        if (isNaN(familyId)) {
            res.status(400).json({ code: 400, message: '无效的家族ID' });
            return;
        }
        // 验证用户是否有权限访问该家族
        const family = await familyService.getFamilyById(familyId, userId);
        if (!family) {
            res.status(404).json({ code: 404, message: '家族不存在或无权访问' });
            return;
        }
        // 获取家族树数据
        const familyTree = await familyService.getFamilyTree(familyId);
        res.status(200).json({
            code: 200,
            message: '获取家族树成功',
            data: familyTree
        });
    }
    catch (error) {
        console.error('获取家族树失败:', error);
        res.status(500).json({ code: 500, message: '获取家族树失败，请稍后重试' });
    }
};
//# sourceMappingURL=family.controller.js.map