import pool from '../config/database.js';
import { RowDataPacket, OkPacket } from 'mysql2/promise';
import { Member } from './member.service.js';
import crypto from 'crypto';

// 家族数据模型接口
export interface Family {
  id: number;
  name: string;
  description?: string;
  creator_id: number;
  created_at: Date;
  updated_at: Date;
}

// 邀请数据模型接口
export interface Invitation {
    id: number;
    family_id: number;
    inviter_id: number;
    token: string;
    status: 'active' | 'used' | 'expired';
    expires_at: Date;
    created_at: Date;
}

// 获取用户的所有家族
export const getUserFamilies = async (userId: number): Promise<any[]> => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT f.*, r.role, r.member_id 
     FROM families f
     JOIN family_user_relations r ON f.id = r.family_id
     WHERE r.user_id = ?`,
    [userId]
  );
  return rows as any[];
};

// 创建家族
export const createFamily = async (creatorId: number, name: string, description?: string): Promise<Family> => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const maxFamilies = parseInt(process.env.MAX_FAMILIES_PER_USER || '2', 10);
        const [rows] = await connection.execute<RowDataPacket[]>(
            'SELECT COUNT(*) as count FROM family_user_relations WHERE user_id = ?',
            [creatorId]
        );
        if (rows[0].count >= maxFamilies) {
            throw new Error(`User cannot create or join more than ${maxFamilies} families.`);
        }

        const [familyResult] = await connection.execute<OkPacket>(
            'INSERT INTO families (name, description, creator_id) VALUES (?, ?, ?)',
            [name, description || null, creatorId]
        );
        const familyId = familyResult.insertId;

        await connection.execute(
            'INSERT INTO family_user_relations (family_id, user_id, role) VALUES (?, ?, ?)',
            [familyId, creatorId, 'admin']
        );

        const [familyRows] = await connection.execute<RowDataPacket[]>('SELECT * FROM families WHERE id = ?', [familyId]);
        
        await connection.commit();
        return familyRows[0] as Family;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

// 获取家族详情
export const getFamilyById = async (familyId: number, userId: number): Promise<Family | null> => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT f.* FROM families f
     JOIN family_user_relations r ON f.id = r.family_id
     WHERE f.id = ? AND r.user_id = ?
     LIMIT 1`,
    [familyId, userId]
  );
  return rows.length > 0 ? (rows[0] as Family) : null;
};

// 更新家族信息
export const updateFamily = async (
  familyId: number,
  userId: number,
  data: Partial<Pick<Family, 'name' | 'description'>>
): Promise<Family | null> => {
    const connection = await pool.getConnection();
    try {
        const [relationRows] = await connection.execute<RowDataPacket[]>(
            "SELECT role FROM family_user_relations WHERE family_id = ? AND user_id = ? AND role = 'admin'",
            [familyId, userId]
        );
        if (relationRows.length === 0) {
            return null; // 无权限
        }

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

        if (updates.length === 0) {
            const [currentFamily] = await connection.execute<RowDataPacket[]>('SELECT * FROM families WHERE id = ?', [familyId]);
            return currentFamily[0] as Family;
        }

        params.push(familyId);
        await connection.execute<OkPacket>(
            `UPDATE families SET ${updates.join(', ')} WHERE id = ?`,
            params
        );

        const [updatedRows] = await connection.execute<RowDataPacket[]>('SELECT * FROM families WHERE id = ?', [familyId]);
        return updatedRows[0] as Family;
    } finally {
        connection.release();
    }
};

// 删除家族
export const deleteFamily = async (familyId: number, userId: number): Promise<boolean> => {
    const connection = await pool.getConnection();
    try {
        const [relationRows] = await connection.execute<RowDataPacket[]>(
            "SELECT role FROM family_user_relations WHERE family_id = ? AND user_id = ?",
            [familyId, userId]
        );
        if (relationRows.length === 0 || relationRows[0].role !== 'admin') {
            return false;
        }
        await connection.execute<OkPacket>('DELETE FROM families WHERE id = ?', [familyId]);
        return true;
    } finally {
        connection.release();
    }
};

// 获取家族成员列表
export const getFamilyMembers = async (familyId: number, userId: number, searchTerm?: string): Promise<any[]> => {
    const hasAccess = await getFamilyById(familyId, userId);
    if (!hasAccess) {
        throw new Error('No permission to access this family');
    }

    let query = `
        SELECT m.*, r.role 
        FROM members m
        LEFT JOIN family_user_relations r ON m.id = r.member_id
        WHERE m.family_id = ?
    `;
    const params: (string | number)[] = [familyId];

    if (searchTerm) {
        query += ' AND m.name LIKE ?';
        params.push(`%${searchTerm}%`);
    }
    query += ' ORDER BY m.id';

    const [rows] = await pool.execute<RowDataPacket[]>(query, params);
    return rows as any[];
};


/**
 * 获取并构建家族的树状结构数据
 */
export const getFamilyTree = async (familyId: number, userId: number): Promise<any[]> => {
  const hasAccess = await getFamilyById(familyId, userId);
  if (!hasAccess) {
    throw new Error('No permission to access this family');
  }

  const [memberRows] = await pool.query<RowDataPacket[]>('SELECT * FROM members WHERE family_id = ?', [familyId]);
  const members = memberRows as Member[];
  if (members.length === 0) {
    return [];
  }

  const memberMap = new Map<number, any>();
  const roots: any[] = [];
  
  members.forEach(member => {
    memberMap.set(member.id, { ...member, children: [] });
  });

  members.forEach(member => {
    const currentNode = memberMap.get(member.id);

    if (member.spouse_id && memberMap.has(member.spouse_id)) {
      const spouseNode = memberMap.get(member.spouse_id);
      currentNode.spouse = { 
        id: spouseNode.id, name: spouseNode.name, gender: spouseNode.gender, status: spouseNode.status 
      };
    }
    
    if (member.father_id && memberMap.has(member.father_id)) {
      const parentNode = memberMap.get(member.father_id);
      parentNode.children.push(currentNode);
    } else {
      roots.push(currentNode);
    }
  });
  
  const rootIds = new Set(roots.map(r => r.id));
  const finalRoots = roots.filter(r => 
    !(r.spouse_id && rootIds.has(r.spouse_id) && r.id > r.spouse_id)
  );

  return finalRoots;
};


// [新增] 更新家族成员角色
export const updateMemberRole = async (familyId: number, adminUserId: number, targetUserId: number, role: 'admin' | 'editor' | 'member'): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [adminRows] = await connection.execute<RowDataPacket[]>(
            'SELECT role FROM family_user_relations WHERE family_id = ? AND user_id = ?',
            [familyId, adminUserId]
        );
        if (adminRows.length === 0 || adminRows[0].role !== 'admin') {
            throw new Error('Permission denied: User is not an admin of this family');
        }

        if (role !== 'admin') {
            const [adminCountRows] = await connection.execute<RowDataPacket[]>(
                'SELECT COUNT(*) as count FROM family_user_relations WHERE family_id = ? AND role = "admin"',
                [familyId]
            );
            if (adminCountRows[0].count <= 1) {
                const [targetUserAdminRows] = await connection.execute<RowDataPacket[]>(
                    'SELECT role FROM family_user_relations WHERE family_id = ? AND user_id = ? AND role = "admin"',
                    [familyId, targetUserId]
                );
                if (targetUserAdminRows.length > 0) {
                    throw new Error('Cannot remove the last admin of the family');
                }
            }
        }

        await connection.execute(
            'UPDATE family_user_relations SET role = ? WHERE family_id = ? AND user_id = ?',
            [role, familyId, targetUserId]
        );
        
        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

// [新增] 创建邀请
export const createInvitation = async (familyId: number, inviterId: number): Promise<Invitation> => {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7天后过期

    const [result] = await pool.execute<OkPacket>(
        'INSERT INTO invitations (family_id, inviter_id, token, expires_at) VALUES (?, ?, ?, ?)',
        [familyId, inviterId, token, expiresAt]
    );

    const [rows] = await pool.execute<RowDataPacket[]>('SELECT * FROM invitations WHERE id = ?', [result.insertId]);
    return rows[0] as Invitation;
};

// [新增] 接受邀请
export const acceptInvitation = async (token: string, newUserId: number): Promise<{ success: boolean; message: string; familyId?: number }> => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [invitationRows] = await connection.execute<RowDataPacket[]>(
            'SELECT * FROM invitations WHERE token = ? AND status = "active" AND expires_at > NOW()',
            [token]
        );

        if (invitationRows.length === 0) {
            await connection.rollback();
            return { success: false, message: 'Invitation is invalid or has expired.' };
        }

        const invitation = invitationRows[0] as Invitation;

        const [existingRelation] = await connection.execute<RowDataPacket[]>(
            'SELECT * FROM family_user_relations WHERE family_id = ? AND user_id = ?',
            [invitation.family_id, newUserId]
        );

        if (existingRelation.length > 0) {
            await connection.rollback();
            return { success: false, message: 'User is already a member of this family.' };
        }

        await connection.execute(
            'INSERT INTO family_user_relations (family_id, user_id, role) VALUES (?, ?, ?)',
            [invitation.family_id, newUserId, 'member']
        );

        await connection.execute(
            'UPDATE invitations SET status = "used" WHERE id = ?',
            [invitation.id]
        );
        
        await connection.commit();
        return { success: true, message: 'Successfully joined the family!', familyId: invitation.family_id };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};
