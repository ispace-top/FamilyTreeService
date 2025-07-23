import pool from '../config/database.js';
// 创建家族
export const createFamily = async (creatorId, name, description) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [result] = await connection.execute('INSERT INTO families (name, description, creator_id, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())', [name, description || null, creatorId]);
        const familyId = result.insertId;
        const [rows] = await connection.execute('SELECT * FROM families WHERE id = ?', [familyId]);
        await connection.commit();
        return rows[0];
    }
    catch (error) {
        await connection.rollback();
        throw error;
    }
    finally {
        connection.release();
    }
};
// 获取家族详情
export const getFamilyById = async (familyId, userId) => {
    const [rows] = await pool.execute(`SELECT f.* FROM families f
     LEFT JOIN family_members fm ON f.id = fm.family_id
     WHERE f.id = ? AND (f.creator_id = ? OR fm.user_id = ?)
     LIMIT 1`, [familyId, userId, userId]);
    return rows.length > 0 ? rows[0] : null;
};
// 更新家族信息
export const updateFamily = async (familyId, userId, data) => {
    const connection = await pool.getConnection();
    try {
        // 验证用户是否为家族创建者
        const [familyRows] = await connection.execute('SELECT * FROM families WHERE id = ? AND creator_id = ?', [familyId, userId]);
        if (familyRows.length === 0) {
            return null;
        }
        // 构建更新语句
        const updates = [];
        const params = [];
        if (data.name !== undefined) {
            updates.push('name = ?');
            params.push(data.name);
        }
        if (data.description !== undefined) {
            updates.push('description = ?');
            params.push(data.description);
        }
        updates.push('updated_at = NOW()');
        if (updates.length === 0) {
            return familyRows[0];
        }
        params.push(familyId);
        await connection.execute(`UPDATE families SET ${updates.join(', ')} WHERE id = ?`, params);
        const [updatedRows] = await connection.execute('SELECT * FROM families WHERE id = ?', [familyId]);
        return updatedRows[0];
    }
    finally {
        connection.release();
    }
};
// 删除家族
export const deleteFamily = async (familyId, userId) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        // 验证用户是否为家族创建者
        const [familyRows] = await connection.execute('SELECT * FROM families WHERE id = ? AND creator_id = ?', [familyId, userId]);
        if (familyRows.length === 0) {
            return false;
        }
        // 删除家族成员关联
        await connection.execute('DELETE FROM family_members WHERE family_id = ?', [familyId]);
        // 删除家族
        await connection.execute('DELETE FROM families WHERE id = ?', [familyId]);
        await connection.commit();
        return true;
    }
    catch (error) {
        await connection.rollback();
        throw error;
    }
    finally {
        connection.release();
    }
};
// 获取家族成员列表
export const getFamilyMembers = async (familyId, userId) => {
    // 验证用户是否有权限访问该家族
    const [familyAccess] = await pool.execute(`SELECT 1 FROM families f
     LEFT JOIN family_members fm ON f.id = fm.family_id
     WHERE f.id = ? AND (f.creator_id = ? OR fm.user_id = ?)
     LIMIT 1`, [familyId, userId, userId]);
    if (familyAccess.length === 0) {
        throw new Error('没有访问该家族的权限');
    }
    const [rows] = await pool.execute(`SELECT m.*, r.name as role_name
     FROM members m
     JOIN family_members fm ON m.id = fm.member_id
     JOIN roles r ON fm.role_id = r.id
     WHERE fm.family_id = ?
     ORDER BY m.id`, [familyId]);
    return rows;
};
// 添加家族成员
export const addFamilyMember = async (familyId, userId, data) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        // 验证用户是否为家族管理员或编辑者
        const [roleRows] = await connection.execute(`SELECT r.name FROM family_members fm
       JOIN roles r ON fm.role_id = r.id
       WHERE fm.family_id = ? AND fm.user_id = ? AND r.name IN ('admin', 'editor')
       LIMIT 1`, [familyId, userId]);
        if (roleRows.length === 0) {
            return null;
        }
        // 创建成员记录
        const [memberResult] = await connection.execute(`INSERT INTO members (family_id, name, gender, birth_date, father_id, mother_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`, [familyId, data.name, data.gender, data.birth_date || null, data.father_id || null, data.mother_id || null]);
        const memberId = memberResult.insertId;
        const [memberRows] = await connection.execute('SELECT * FROM members WHERE id = ?', [memberId]);
        await connection.commit();
        return memberRows[0];
    }
    catch (error) {
        await connection.rollback();
        throw error;
    }
    finally {
        connection.release();
    }
};
//# sourceMappingURL=family.service.js.map