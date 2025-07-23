import pool from '../config/database.js';
import { RowDataPacket, OkPacket } from 'mysql2/promise';
import { Member } from './member.service.js';

// 获取用户的所有家族
export const getUserFamilies = async (userId: number): Promise<Family[]> => {
  const [rows] = await pool.execute(
    `SELECT f.* FROM families f
     JOIN family_members fm ON f.id = fm.family_id
     WHERE fm.user_id = ?
     GROUP BY f.id`,
    [userId]
  );
  return rows as Family[];
};

// 家族数据模型接口
export interface Family {
  id: number;
  name: string;
  description?: string;
  creator_id: number;
  created_at: Date;
  updated_at: Date;
}

// 创建家族
export const createFamily = async (creatorId: number, name: string, description?: string): Promise<Family> => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [result] = await connection.execute<OkPacket>(
      'INSERT INTO families (name, description, creator_id, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())',
      [name, description || null, creatorId]
    );

    const familyId = result.insertId;
    
    // 获取管理员角色ID
    const [roleRows] = await connection.execute<RowDataPacket[]>(
      'SELECT id FROM roles WHERE name = ?',
      ['admin']
    );
    if (roleRows.length === 0) {
      throw new Error('Admin role not found');
    }
    const adminRoleId = roleRows[0].id;
    
    // 添加家族-用户关联记录
    await connection.execute<OkPacket>(
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
     LEFT JOIN family_members fm ON f.id = fm.family_id
     WHERE f.id = ? AND (f.creator_id = ? OR fm.user_id = ?)
     LIMIT 1`,
    [familyId, userId, userId]
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
    // 验证用户是否为家族创建者
    const [familyRows] = await connection.execute<RowDataPacket[]>(
      'SELECT * FROM families WHERE id = ? AND creator_id = ?', 
      [familyId, userId]
    );
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
      return familyRows[0] as Family;
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
    await connection.beginTransaction();

    // 验证用户是否为家族创建者
    const [familyRows] = await connection.execute<RowDataPacket[]>(
      'SELECT * FROM families WHERE id = ? AND creator_id = ?', 
      [familyId, userId]
    );
    if (familyRows.length === 0) {
      return false;
    }

    // 删除家族成员关联
    await connection.execute<OkPacket>('DELETE FROM family_members WHERE family_id = ?', [familyId]);
    // 删除家族
    await connection.execute<OkPacket>('DELETE FROM families WHERE id = ?', [familyId]);

    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

// 获取家族成员列表
export const getFamilyMembers = async (familyId: number, userId: number): Promise<any[]> => {
  // 验证用户是否有权限访问该家族
  const [familyAccess] = await pool.execute<RowDataPacket[]>(
    `SELECT 1 FROM families f
     LEFT JOIN family_members fm ON f.id = fm.family_id
     WHERE f.id = ? AND (f.creator_id = ? OR fm.user_id = ?)
     LIMIT 1`,
    [familyId, userId, userId]
  );

  if (familyAccess.length === 0) {
    throw new Error('没有访问该家族的权限');
  }

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT m.*, r.name as role_name
     FROM members m
     JOIN family_members fm ON m.id = fm.member_id
     JOIN roles r ON fm.role_id = r.id
     WHERE fm.family_id = ?
     ORDER BY m.id`,
    [familyId]
  );

  return rows as any[];
};

// 添加家族成员
export const addFamilyMember = async (
  familyId: number,
  userId: number,
  data: Omit<Member, 'id' | 'family_id' | 'created_at' | 'updated_at'>
): Promise<Member | null> => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 验证用户是否为家族管理员或编辑者
    const [roleRows] = await connection.execute<RowDataPacket[]>(
      `SELECT r.name FROM family_members fm
       JOIN roles r ON fm.role_id = r.id
       WHERE fm.family_id = ? AND fm.user_id = ? AND r.name IN ('admin', 'editor')
       LIMIT 1`,
      [familyId, userId]
    );

    if (roleRows.length === 0) {
      return null; // 无权限
    }

    // 插入新成员
    const [memberResult] = await connection.execute<OkPacket>(
      `INSERT INTO members (family_id, name, gender, birth_date, death_date, father_id, mother_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [familyId, data.name, data.gender, data.birth_date || null, data.death_date || null, 
       data.father_id || null, data.mother_id || null]
    );
    
    const memberId = memberResult.insertId;
    
    // 获取普通成员角色ID
    const [memberRoleRows] = await connection.execute<RowDataPacket[]>(
      'SELECT id FROM roles WHERE name = ?',
      ['member']
    );
    if (memberRoleRows.length === 0) {
      throw new Error('Member role not found');
    }
    const memberRoleId = memberRoleRows[0].id;
    
    // 将成员添加到家族成员关系表
    await connection.execute<OkPacket>(
      'INSERT INTO family_members (user_id, family_id, member_id, role_id, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())',
      [userId, familyId, memberId, memberRoleId]
    );
    
    const [newMemberRows] = await connection.execute<RowDataPacket[]>(
      'SELECT * FROM members WHERE id = ?',
      [memberId]
    );
    
    await connection.commit();
    return newMemberRows[0] as Member;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

// 获取家族树结构

export const getFamilyTree = async (familyId: number): Promise<any> => {
  // 获取家族基本信息
  const [familyRows] = await pool.query('SELECT id, name FROM families WHERE id = ?', [familyId]);
  if ((familyRows as any[]).length === 0) {
    throw new Error('家族不存在');
  }
  const family = (familyRows as any[])[0];

  // 检查用户是否有权访问该家族
  // 检查用户是否有权限访问该家族
  console.log('权限检查 - familyId:', familyId, 'userId:', userId);
  const [relations] = await pool.query(
  `SELECT fur.id, fur.family_id, fur.user_id, fur.role, fur.member_id FROM family_user_relations fur WHERE fur.family_id = ? AND fur.user_id = ?
   UNION
   SELECT NULL AS id, f.id AS family_id, f.creator_id AS user_id, 'admin' AS role, NULL AS member_id FROM families f WHERE f.id = ? AND f.creator_id = ?`,
  [familyId, userId, familyId, userId]
  );
  console.log('权限检查结果:', relations);
  if (relations.length === 0) {
  throw new Error('无权访问该家族');
  }

  // 获取家族所有成员
  const [memberRows] = await pool.query('SELECT * FROM members WHERE family_id = ?', [familyId]);
  const members = memberRows as Member[];

  // 构建成员映射表
  const memberMap = new Map<number, any>();
  members.forEach(member => {
    memberMap.set(member.id, { ...member, children: [] });
  });

  // 构建家族树结构
  const rootMembers: any[] = [];
  members.forEach(member => {
    const current = memberMap.get(member.id);
    if (member.parent_id === null || member.parent_id === undefined) {
      rootMembers.push(current);
    } else {
      const parent = memberMap.get(member.parent_id);
      if (parent) {
        parent.children.push(current);
      }
    }
  });

  return {
    id: family.id,
    name: family.name,
    members: rootMembers
  };
};