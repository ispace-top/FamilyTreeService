import pool from '../config/database.js';
import { RowDataPacket, OkPacket } from 'mysql2/promise';

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
      return null;
    }

    // 创建成员记录
    const [memberResult] = await connection.execute<OkPacket>(
      `INSERT INTO members (family_id, name, gender, birth_date, father_id, mother_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [familyId, data.name, data.gender, data.birth_date || null, data.father_id || null, data.mother_id || null]
    );

    const memberId = memberResult.insertId;
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

// 成员数据模型接口
export interface Member {
  id: number;
  family_id: number;
  name: string;
  gender: 'male' | 'female' | 'other';
  birth_date?: Date;
  father_id?: number;
  mother_id?: number;
  created_at: Date;
  updated_at: Date;
}