import * as memberService from '../services/member.service.js';
// 获取成员详情
export const getMemberById = async (req, res) => {
    try {
        const memberId = parseInt(req.params.id, 10);
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ message: '用户未认证' });
            return;
        }
        if (isNaN(memberId)) {
            res.status(400).json({ message: '无效的成员ID' });
            return;
        }
        const member = await memberService.getMemberById(memberId, userId);
        if (!member) {
            res.status(404).json({ message: '成员不存在或无权访问' });
            return;
        }
        res.status(200).json({
            message: '获取成员详情成功',
            data: member
        });
    }
    catch (error) {
        console.error('获取成员详情失败:', error);
        res.status(500).json({ message: '获取成员详情失败，请稍后重试' });
    }
};
// 更新成员信息
export const updateMember = async (req, res) => {
    try {
        const memberId = parseInt(req.params.id, 10);
        const userId = req.user?.userId;
        const memberData = req.body;
        if (!userId) {
            res.status(401).json({ message: '用户未认证' });
            return;
        }
        if (isNaN(memberId)) {
            res.status(400).json({ message: '无效的成员ID' });
            return;
        }
        const updatedMember = await memberService.updateMember(memberId, userId, memberData);
        if (!updatedMember) {
            res.status(404).json({ message: '成员不存在或无权更新' });
            return;
        }
        res.status(200).json({
            message: '更新成员信息成功',
            data: updatedMember
        });
    }
    catch (error) {
        console.error('更新成员信息失败:', error);
        res.status(500).json({ message: '更新成员信息失败，请稍后重试' });
    }
};
// 删除成员
export const deleteMember = async (req, res) => {
    try {
        const memberId = parseInt(req.params.id, 10);
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ message: '用户未认证' });
            return;
        }
        if (isNaN(memberId)) {
            res.status(400).json({ message: '无效的成员ID' });
            return;
        }
        const result = await memberService.deleteMember(memberId, userId);
        if (!result) {
            res.status(404).json({ message: '成员不存在或无权删除' });
            return;
        }
        res.status(200).json({ message: '成员删除成功' });
    }
    catch (error) {
        console.error('删除成员失败:', error);
        res.status(500).json({ message: '删除成员失败，请稍后重试' });
    }
};
// 获取成员亲属关系
export const getMemberRelatives = async (req, res) => {
    try {
        const memberId = parseInt(req.params.memberId, 10);
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ message: '用户未认证' });
            return;
        }
        if (isNaN(memberId)) {
            res.status(400).json({ message: '无效的成员ID' });
            return;
        }
        const relatives = await memberService.getMemberRelatives(memberId, userId);
        res.status(200).json({
            message: '获取成员亲属关系成功',
            data: relatives
        });
    }
    catch (error) {
        console.error('获取成员亲属关系失败:', error);
        res.status(500).json({ message: '获取成员亲属关系失败，请稍后重试' });
    }
};
// 添加成员亲属关系
export const addMemberRelative = async (req, res) => {
    try {
        const memberId = parseInt(req.params.memberId, 10);
        const { relativeId, relationType } = req.body;
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ message: '用户未认证' });
            return;
        }
        if (isNaN(memberId) || !relativeId || !relationType) {
            res.status(400).json({ message: '成员ID、亲属ID和关系类型是必填项' });
            return;
        }
        const newRelation = await memberService.addMemberRelative(memberId, userId, relativeId, relationType);
        if (!newRelation) {
            res.status(403).json({ message: '没有添加亲属关系的权限' });
            return;
        }
        res.status(201).json({
            message: '添加成员亲属关系成功',
            data: newRelation
        });
    }
    catch (error) {
        console.error('添加成员亲属关系失败:', error);
        res.status(500).json({ message: '添加成员亲属关系失败，请稍后重试' });
    }
};
//# sourceMappingURL=member.controller.js.map