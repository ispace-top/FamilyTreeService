import pool from '../config/database.js';
import { RowDataPacket, OkPacket } from 'mysql2/promise';

// 成员数据模型接口
export interface Member {
  id: number;
  family_id: number;
  name: string;
  gender: 'male' | 'female' | 'other';
  birth_date?: Date;
  death_date?: Date;
  father_id?: number;
  mother_id?: number;
  parent_id?: number;
  created_at: Date;
  updated_at: Date;
}

// 成员关系接口
export interface MemberRelation {
  id: number;
  member_id: number;
  relative_id: number;
  relation_type: string;
  created_at: Date;
}

// 获取成员详情
export const getMemberById = async (memberId: number, userId: number): Promise<Member | null> => {
  // 先检查成员是否存在
  const [memberRows] = await pool.execute<RowDataPacket[]>('SELECT * FROM members WHERE id = ?', [memberId]);
  if (memberRows.length === 0) {
    return null; // 成员不存在
  }
  
  const member = memberRows[0] as Member;
  
  // 再检查权限
  const [permissionRows] = await pool.execute<RowDataPacket[]>(
    `SELECT 1 FROM families f
     WHERE f.id = ? AND (f.creator_id = ? OR EXISTS (
       SELECT 1 FROM family_members fm WHERE fm.family_id = f.id AND fm.user_id = ?
     ))`,
    [member.family_id, userId, userId]
  );
  
  if (permissionRows.length === 0) {
    throw new Error('No permission'); // 无权限访问
  }
  
  return member;
};

// 更新成员信息
export const updateMember = async (
  memberId: number,
  userId: number,
  data: Partial<Omit<Member, 'id' | 'family_id' | 'created_at' | 'updated_at'>>
): Promise<Member | null> => {
  const connection = await pool.getConnection();
  try {
    // 验证用户是否有权限更新该成员
    const [accessRows] = await connection.execute<RowDataPacket[]>(
      `SELECT f.id FROM members m
       JOIN families f ON m.family_id = f.id
       WHERE m.id = ? AND (
         f.creator_id = ? OR 
         EXISTS (SELECT 1 FROM family_members fm WHERE fm.family_id = f.id AND fm.user_id = ?)
       )
       LIMIT 1`,
      [memberId, userId, userId]
    );

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
      const [memberRows] = await connection.execute<RowDataPacket[]>('SELECT * FROM members WHERE id = ?', [memberId]);
      return memberRows[0] as Member;
    }

    params.push(memberId);
    await connection.execute<OkPacket>(
      `UPDATE members SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    const [updatedRows] = await connection.execute<RowDataPacket[]>('SELECT * FROM members WHERE id = ?', [memberId]);
    return updatedRows[0] as Member;
  } finally {
    connection.release();
  }
};

// 删除成员
export const deleteMember = async (memberId: number, userId: number): Promise<boolean> => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 验证用户是否有权限删除该成员
    const [accessRows] = await connection.execute<RowDataPacket[]>(
      `SELECT f.id FROM members m
       JOIN families f ON m.family_id = f.id
       LEFT JOIN family_members fm ON f.id = fm.family_id
       WHERE m.id = ? AND (f.creator_id = ? OR fm.user_id = ?)
       LIMIT 1`,
      [memberId, userId, userId]
    );

    if (accessRows.length === 0) {
      return false;
    }

    // 删除成员关系记录
    await connection.execute<OkPacket>('DELETE FROM member_relations WHERE member_id = ? OR relative_id = ?', [memberId, memberId]);
    // 删除成员记录
    await connection.execute<OkPacket>('DELETE FROM members WHERE id = ?', [memberId]);

    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

// 获取成员的亲属关系
export const getMemberRelatives = async (memberId: number, userId: number): Promise<MemberRelation[]> => {
  const connection = await pool.getConnection();
  try {
  const [accessRows] = await connection.execute<RowDataPacket[]>(
    `SELECT f.id FROM members m
     JOIN families f ON m.family_id = f.id
     LEFT JOIN family_members fm ON f.id = fm.family_id
     WHERE m.id = ? AND (f.creator_id = ? OR fm.user_id = ?)
     LIMIT 1`,
    [memberId, userId, userId]
  );

  if (accessRows.length === 0) {
    throw new Error('没有访问权限');
  }

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT mr.*, m.name as relative_name
     FROM member_relations mr
     JOIN members m ON mr.relative_id = m.id
     WHERE mr.member_id = ?`,
    [memberId]
  );

  return rows as MemberRelation[];
  } finally {
    connection.release();
  }
};

// 添加成员亲属关系
export const addMemberRelative = async (
  memberId: number,
  userId: number,
  relativeId: number,
  relationType: string
): Promise<MemberRelation | null> => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 验证用户是否有权限操作
    const [accessRows] = await connection.execute<RowDataPacket[]>(
      `SELECT f.id FROM members m
       JOIN families f ON m.family_id = f.id
       LEFT JOIN family_members fm ON f.id = fm.family_id
       WHERE m.id = ? AND (f.creator_id = ? OR fm.user_id = ?)
       LIMIT 1`,
      [memberId, userId, userId]
    );

    if (accessRows.length === 0) {
      return null;
    }

    // 检查亲属是否属于同一个家族
    const [familyCheck] = await connection.execute<RowDataPacket[]>(
      `SELECT 1 FROM members m1
       JOIN members m2 ON m1.family_id = m2.family_id
       WHERE m1.id = ? AND m2.id = ?`,
      [memberId, relativeId]
    );

    if (familyCheck.length === 0) {
      throw new Error('亲属必须属于同一个家族');
    }

    // 插入亲属关系记录
    const [relationResult] = await connection.execute<OkPacket>(
      `INSERT INTO member_relations (member_id, relative_id, relation_type, created_at)
       VALUES (?, ?, ?, NOW())`,
      [memberId, relativeId, relationType]
    );

    // 获取新创建的关系记录
    const [newRelationRows] = await connection.execute<RowDataPacket[]>(
      `SELECT * FROM member_relations WHERE id = ?`,
      [relationResult.insertId]
    );

    await connection.commit();
    return newRelationRows[0] as MemberRelation;
  } finally {
    connection.release();
  }
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
      return null;
    }

    // 创建成员记录
    const [memberResult] = await connection.execute(
      `INSERT INTO members (family_id, name, gender, birth_date, father_id, mother_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [familyId, data.name, data.gender, data.birth_date || null, data.father_id || null, data.mother_id || null]
    );

    const memberId = (memberResult as any).insertId;
    const [memberRows] = await connection.execute<RowDataPacket[]>('SELECT * FROM members WHERE id = ?', [memberId]);

    await connection.commit();
    return memberRows[0] as Member;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};