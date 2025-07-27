import pool from '../config/database.js';
import { RowDataPacket, OkPacket } from 'mysql2/promise';
import { Member } from './member.service.js';
import crypto from 'crypto';

export interface Family {
  id: number;
  name: string;
  description?: string;
  creator_id: number;
  avatar?: string;
  banner?: string;
  created_at: Date;
  updated_at: Date;
}

export const createFamily = async (creatorId: number, name: string, description?: string): Promise<Family> => {
    const connection = await pool.getConnection();
    try {
        const maxFamilies = parseInt(process.env.MAX_FAMILIES_PER_USER || '2', 10);
        const [rows] = await connection.execute<RowDataPacket[]>(
            'SELECT COUNT(*) as count FROM family_user_relations WHERE user_id = ?',
            [creatorId]
        );
        if (rows[0].count >= maxFamilies) {
            throw new Error(`User cannot create or join more than ${maxFamilies} families.`);
        }
        
        await connection.beginTransaction();

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

export const getUserFamilies = async (userId: number): Promise<any[]> => {
  // --- 修改：明确列出所有字段 ---
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT 
        f.id, f.name, f.description, f.creator_id, f.avatar, f.banner, f.introduction, f.created_at, f.updated_at,
        r.role, r.member_id 
     FROM families f
     JOIN family_user_relations r ON f.id = r.family_id
     WHERE r.user_id = ?`,
    [userId]
  );
  return rows as any[];
};

export const getFamilyById = async (familyId: number, userId: number): Promise<Family | null> => {
  // --- 修改：明确列出所有字段 ---
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT 
        f.id, f.name, f.description, f.creator_id, f.avatar, f.banner, f.introduction, f.created_at, f.updated_at
     FROM families f
     JOIN family_user_relations r ON f.id = r.family_id
     WHERE f.id = ? AND r.user_id = ?
     LIMIT 1`,
    [familyId, userId]
  );
  return rows.length > 0 ? (rows[0] as Family) : null;
};

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
    const params: (number | string)[] = [familyId];

    if (searchTerm) {
        query += ' AND m.name LIKE ?';
        params.push(`%${searchTerm}%`);
    }

    query += ' ORDER BY m.id';

    const [rows] = await pool.execute<RowDataPacket[]>(query, params);
    return rows as any[];
};

export const getFamilyTree = async (familyId: number, userId: number): Promise<any | null> => {
    const hasAccess = await getFamilyById(familyId, userId);
    if (!hasAccess) {
        throw new Error('No permission to access this family');
    }
    
    const [memberRows] = await pool.query<RowDataPacket[]>('SELECT * FROM members WHERE family_id = ? ORDER BY id ASC', [familyId]);
    const members = memberRows as Member[];

    if (members.length === 0) {
        return null;
    }

    const memberMap = new Map<number, any>();
    members.forEach(member => {
        memberMap.set(member.id, { ...member, children: [], spouses: [] });
    });
    
    const [spouseRelations] = await pool.query<RowDataPacket[]>('SELECT member1_id, member2_id FROM spouse_relations WHERE family_id = ?', [familyId]);
    
    spouseRelations.forEach(rel => {
        const member1 = memberMap.get(rel.member1_id);
        const member2 = memberMap.get(rel.member2_id);
        if (member1 && member2) {
            member1.spouses.push({ id: member2.id, name: member2.name, gender: member2.gender, status: member2.status });
            member2.spouses.push({ id: member1.id, name: member1.name, gender: member1.gender, status: member1.status });
        }
    });

    const roots: any[] = [];
    members.forEach(member => {
        const currentNode = memberMap.get(member.id);
        if (member.father_id && memberMap.has(member.father_id)) {
            const parentNode = memberMap.get(member.father_id);
            if(parentNode) parentNode.children.push(currentNode);
        } else if (member.mother_id && memberMap.has(member.mother_id)) {
            const parentNode = memberMap.get(member.mother_id);
            if(parentNode) parentNode.children.push(currentNode);
        } else {
            roots.push(currentNode);
        }
    });

    const rootIds = new Set(roots.map(r => r.id));
    const finalRoots = roots.filter(r => {
        if (r.spouses.length === 0) return true;
        return r.spouses.every((s: any) => !rootIds.has(s.id) || r.id < s.id);
    });
    
    return finalRoots[0] || null;
};

export const getFamilyRoles = async (familyId: number, userId: number): Promise<any[]> => {
    const [relationRows] = await pool.execute<RowDataPacket[]>(
        'SELECT role FROM family_user_relations WHERE family_id = ? AND user_id = ?',
        [familyId, userId]
    );
    if (relationRows.length === 0 || relationRows[0].role !== 'admin') {
        throw new Error('No permission to access this resource');
    }

    const [rows] = await pool.execute<RowDataPacket[]>(`
        SELECT
            u.id as userId,
            u.nickname,
            u.avatar_url,
            r.role,
            r.member_id as memberId,
            m.name as memberName
        FROM family_user_relations r
        JOIN users u ON r.user_id = u.id
        LEFT JOIN members m ON r.member_id = m.id
        WHERE r.family_id = ?
        ORDER BY u.id
    `, [familyId]);
    
    return rows;
};

export const updateMemberRole = async (familyId: number, operatorId: number, targetUserId: number, newRole: string): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [operatorRows] = await connection.execute<RowDataPacket[]>(
            'SELECT role FROM family_user_relations WHERE family_id = ? AND user_id = ?',
            [familyId, operatorId]
        );
        if (operatorRows.length === 0 || operatorRows[0].role !== 'admin') {
            throw new Error('Only admins can change roles.');
        }

        if (operatorId === targetUserId && newRole !== 'admin') {
            const [adminCountRows] = await connection.execute<RowDataPacket[]>(
                "SELECT COUNT(*) as count FROM family_user_relations WHERE family_id = ? AND role = 'admin'",
                [familyId]
            );
            if (adminCountRows[0].count <= 1) {
                throw new Error('Cannot remove the last admin.');
            }
        }
        
        await connection.execute(
            'UPDATE family_user_relations SET role = ? WHERE family_id = ? AND user_id = ?',
            [newRole, familyId, targetUserId]
        );
        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

export const createInvitation = async (familyId: number, inviterId: number): Promise<{ token: string }> => {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

    await pool.execute(
        'INSERT INTO invitations (family_id, inviter_id, token, expires_at) VALUES (?, ?, ?, ?)',
        [familyId, inviterId, token, expiresAt]
    );
    return { token };
};

export const acceptInvitation = async (token: string, userId: number): Promise<{ familyId: number }> => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [invitations] = await connection.execute<RowDataPacket[]>(
            'SELECT * FROM invitations WHERE token = ? AND status = "active" AND expires_at > NOW()',
            [token]
        );
        if (invitations.length === 0) {
            throw new Error('Invitation is invalid or has expired.');
        }
        const invitation = invitations[0];
        
        const [existingRelation] = await connection.execute<RowDataPacket[]>(
            'SELECT 1 FROM family_user_relations WHERE family_id = ? AND user_id = ?',
            [invitation.family_id, userId]
        );
        if (existingRelation.length > 0) {
            throw new Error('User is already a member of this family.');
        }
        
        const maxFamilies = parseInt(process.env.MAX_FAMILIES_PER_USER || '2', 10);
        const [rows] = await connection.execute<RowDataPacket[]>(
            'SELECT COUNT(*) as count FROM family_user_relations WHERE user_id = ?',
            [userId]
        );
        if (rows[0].count >= maxFamilies) {
            throw new Error(`User cannot join more than ${maxFamilies} families.`);
        }

        await connection.execute(
            'INSERT INTO family_user_relations (family_id, user_id, role) VALUES (?, ?, ?)',
            [invitation.family_id, userId, 'member']
        );
        
        await connection.execute(
            'UPDATE invitations SET status = "used" WHERE id = ?',
            [invitation.id]
        );
        
        await connection.commit();
        return { familyId: invitation.family_id };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

export const claimMember = async (familyId: number, userId: number, memberId: number): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [memberRows] = await connection.execute<RowDataPacket[]>(
            'SELECT id FROM members WHERE id = ? AND family_id = ?',
            [memberId, familyId]
        );
        if (memberRows.length === 0) {
            throw new Error('Member does not exist in this family.');
        }

        const [alreadyClaimedRows] = await connection.execute<RowDataPacket[]>(
            'SELECT 1 FROM family_user_relations WHERE member_id = ?',
            [memberId]
        );
        if (alreadyClaimedRows.length > 0) {
            throw new Error('This member has already been claimed.');
        }

        const [result] = await connection.execute<OkPacket>(
            'UPDATE family_user_relations SET member_id = ? WHERE user_id = ? AND family_id = ?',
            [memberId, userId, familyId]
        );
        
        if (result.affectedRows === 0) {
            throw new Error('User does not belong to this family or claim failed.');
        }
        
        await connection.commit();
    } catch(error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

export const updateFamilyAvatar = async (familyId: number, userId: number, avatarUrl: string): Promise<Family | null> => {
    const [relationRows] = await pool.execute<RowDataPacket[]>(
        "SELECT role FROM family_user_relations WHERE family_id = ? AND user_id = ? AND role = 'admin'",
        [familyId, userId]
    );
    if (relationRows.length === 0) {
        throw new Error('Only admins can update the family avatar.');
    }

    const [result] = await pool.execute<OkPacket>('UPDATE families SET avatar = ? WHERE id = ?', [avatarUrl, familyId]);
    
    if (result.affectedRows === 0) {
        return null;
    }

    const [updatedRows] = await pool.execute<RowDataPacket[]>('SELECT * FROM families WHERE id = ?', [familyId]);
    return updatedRows[0] as Family;
};

export const updateFamilyBanner = async (familyId: number, userId: number, bannerUrl: string): Promise<Family | null> => {
    const [relationRows] = await pool.execute<RowDataPacket[]>(
        "SELECT role FROM family_user_relations WHERE family_id = ? AND user_id = ? AND role = 'admin'",
        [familyId, userId]
    );
    if (relationRows.length === 0) {
        throw new Error('Only admins can update the family banner.');
    }

    const [result] = await pool.execute<OkPacket>('UPDATE families SET banner = ? WHERE id = ?', [bannerUrl, familyId]);

    if (result.affectedRows === 0) {
        return null;
    }

    const [updatedRows] = await pool.execute<RowDataPacket[]>('SELECT * FROM families WHERE id = ?', [familyId]);
    return updatedRows[0] as Family;
};
