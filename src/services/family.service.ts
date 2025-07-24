import pool from '../config/database.js';
import { RowDataPacket, OkPacket } from 'mysql2/promise';
import { Member } from './member.service.js';

// 家族数据模型接口
export interface Family {
  id: number;
  name: string;
  description?: string;
  creator_id: number;
  created_at: Date;
  updated_at: Date;
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

        const [familyResult] = await connection.execute<OkPacket>(
            'INSERT INTO families (name, description, creator_id) VALUES (?, ?, ?)',
            [name, description || null, creatorId]
        );
        const familyId = familyResult.insertId;

        await connection.execute(
            'INSERT INTO family_user_relations (family_id, user_id, role) VALUES (?, ?, ?)',
            [familyId, creatorId, 'admin']
        );

        const [rows] = await connection.execute<RowDataPacket[]>('SELECT * FROM families WHERE id = ?', [familyId]);
        
        await connection.commit();
        return rows[0] as Family;
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
        const [familyRows] = await connection.execute<RowDataPacket[]>(
            'SELECT creator_id FROM families WHERE id = ?',
            [familyId]
        );
        if (familyRows.length === 0 || familyRows[0].creator_id !== userId) {
            return false; // 家族不存在或用户不是创建者
        }

        await connection.execute<OkPacket>('DELETE FROM families WHERE id = ?', [familyId]);
        return true;
    } finally {
        connection.release();
    }
};

// 获取家族成员列表
export const getFamilyMembers = async (familyId: number, userId: number): Promise<any[]> => {
    const hasAccess = await getFamilyById(familyId, userId);
    if (!hasAccess) {
        throw new Error('No permission to access this family');
    }

    const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT m.*, r.role 
         FROM members m
         LEFT JOIN family_user_relations r ON m.id = r.member_id
         WHERE m.family_id = ?
         ORDER BY m.id`,
        [familyId]
    );
    return rows as any[];
};


/**
 * 获取并构建家族的树状结构数据
 */
export const getFamilyTree = async (familyId: number, userId: number): Promise<any> => {
  const hasAccess = await getFamilyById(familyId, userId);
  if (!hasAccess) {
    throw new Error('No permission to access this family');
  }

  const [memberRows] = await pool.query<RowDataPacket[]>('SELECT * FROM members WHERE family_id = ?', [familyId]);
  const members = memberRows as Member[];
  if (members.length === 0) {
    return { id: familyId, name: hasAccess.name, children: [] };
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

  return {
    id: familyId,
    name: hasAccess.name,
    children: finalRoots
  };
};
