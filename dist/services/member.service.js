import pool from '../config/database.js';
// 获取成员详情
export const getMemberById = async (memberId, userId) => {
    const [rows] = await pool.execute(`SELECT m.* FROM members m
     JOIN families f ON m.family_id = f.id
     LEFT JOIN family_members fm ON f.id = fm.family_id
     WHERE m.id = ? AND (f.creator_id = ? OR fm.user_id = ?)
     LIMIT 1`, [memberId, userId, userId]);
    return rows.length > 0 ? rows[0] : null;
};
// 更新成员信息
export const updateMember = async (memberId, userId, data) => {
    const connection = await pool.getConnection();
    try {
        // 验证用户是否有权限更新该成员
        const [accessRows] = await connection.execute(`SELECT f.id FROM members m
       JOIN families f ON m.family_id = f.id
       LEFT JOIN family_members fm ON f.id = fm.family_id
       WHERE m.id = ? AND (f.creator_id = ? OR fm.user_id = ?)
       LIMIT 1`, [memberId, userId, userId]);
        if (accessRows.length === 0) {
            return null;
        }
        // 构建更新语句
        const updates = [];
        const params = [];
        if (data.name !== undefined) {
            updates.push('name = ?');
            params.push(data.name);
        }
        if (data.gender !== undefined) {
            updates.push('gender = ?');
            params.push(data.gender);
        }
        if (data.birth_date !== undefined) {
            updates.push('birth_date = ?');
            params.push(data.birth_date);
        }
        if (data.death_date !== undefined) {
            updates.push('death_date = ?');
            params.push(data.death_date);
        }
        if (data.father_id !== undefined) {
            updates.push('father_id = ?');
            params.push(data.father_id);
        }
        if (data.mother_id !== undefined) {
            updates.push('mother_id = ?');
            params.push(data.mother_id);
        }
        updates.push('updated_at = NOW()');
        if (updates.length === 0) {
            const [memberRows] = await connection.execute('SELECT * FROM members WHERE id = ?', [memberId]);
            return memberRows[0];
        }
        params.push(memberId);
        await connection.execute(`UPDATE members SET ${updates.join(', ')} WHERE id = ?`, params);
        const [updatedRows] = await connection.execute('SELECT * FROM members WHERE id = ?', [memberId]);
        return updatedRows[0];
    }
    finally {
        connection.release();
    }
};
// 删除成员
export const deleteMember = async (memberId, userId) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        // 验证用户是否有权限删除该成员
        const [accessRows] = await connection.execute(`SELECT f.id FROM members m
       JOIN families f ON m.family_id = f.id
       LEFT JOIN family_members fm ON f.id = fm.family_id
       WHERE m.id = ? AND (f.creator_id = ? OR fm.user_id = ?)
       LIMIT 1`, [memberId, userId, userId]);
        if (accessRows.length === 0) {
            return false;
        }
        // 删除成员关系记录
        await connection.execute('DELETE FROM member_relations WHERE member_id = ? OR relative_id = ?', [memberId, memberId]);
        // 删除成员记录
        await connection.execute('DELETE FROM members WHERE id = ?', [memberId]);
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
// 获取成员的亲属关系
export const getMemberRelatives = async (memberId, userId) => {
    const [accessRows] = await connection.execute(`SELECT f.id FROM members m
     JOIN families f ON m.family_id = f.id
     LEFT JOIN family_members fm ON f.id = fm.family_id
     WHERE m.id = ? AND (f.creator_id = ? OR fm.user_id = ?)
     LIMIT 1`, [memberId, userId, userId]);
    if (accessRows.length === 0) {
        throw new Error('没有访问权限');
    }
    const [rows] = await pool.execute(`SELECT mr.*, m.name as relative_name
     FROM member_relations mr
     JOIN members m ON mr.relative_id = m.id
     WHERE mr.member_id = ?`, [memberId]);
    return rows;
};
// 添加成员亲属关系
export const addMemberRelative = async (memberId, userId, relativeId, relationType) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        // 验证用户是否有权限操作
        const [accessRows] = await connection.execute(`SELECT f.id FROM members m
       JOIN families f ON m.family_id = f.id
       LEFT JOIN family_members fm ON f.id = fm.family_id
       WHERE m.id = ? AND (f.creator_id = ? OR fm.user_id = ?)
       LIMIT 1`, [memberId, userId, userId]);
        if (accessRows.length === 0) {
            return null;
        }
        // 验证亲属是否属于同一个家族
        const [familyCheck] = await connection.execute(`SELECT 1 FROM members m1
       JOIN members m2 ON m1.family_id = m2.family_id
       WHERE m1.id = ? AND m2.id = ?
       LIMIT 1`, [memberId, relativeId]);
        if (familyCheck.length === 0) {
            throw new Error('亲属必须属于同一个家族');
        }
        // 添加亲属关系
        const [result] = await connection.execute('INSERT INTO member_relations (member_id, relative_id, relation_type, created_at) VALUES (?, ?, ?, NOW())', [memberId, relativeId, relationType]);
        const relationId = result.insertId;
        const [relationRows] = await connection.execute('SELECT * FROM member_relations WHERE id = ?', [relationId]);
        await connection.commit();
        return relationRows[0];
    }
    catch (error) {
        await connection.rollback();
        throw error;
    }
    finally {
        connection.release();
    }
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
//# sourceMappingURL=member.service.js.map