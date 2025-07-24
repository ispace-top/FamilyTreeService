import pool from '../config/database.js';
import { RowDataPacket, OkPacket } from 'mysql2/promise';

// 成员数据模型接口 (与 schema.sql 保持一致)
export interface Member {
  id: number;
  family_id: number;
  name: string;
  gender: 'male' | 'female' | 'other';
  status: 'alive' | 'deceased';
  birth_date?: string;
  death_date?: string;
  father_id?: number;
  mother_id?: number;
  spouse_id?: number;
  phone?: string;
  wechat_id?: string;
  original_address?: string;
  current_address?: string;
  occupation?: string;
  created_at: Date;
}

// 获取成员详情 (已修正: 权限验证使用 family_user_relations)
export const getMemberById = async (memberId: number, userId: number): Promise<Member | null> => {
  const [memberRows] = await pool.execute<RowDataPacket[]>('SELECT * FROM members WHERE id = ?', [memberId]);
  if (memberRows.length === 0) {
    return null; // 成员不存在
  }
  const member = memberRows[0] as Member;

  // 权限检查: 确保用户属于该家族
  const [permissionRows] = await pool.execute<RowDataPacket[]>(
    'SELECT 1 FROM family_user_relations WHERE family_id = ? AND user_id = ?',
    [member.family_id, userId]
  );
  
  if (permissionRows.length === 0) {
    throw new Error('No permission to access this member'); // 无权访问
  }
  
  return member;
};

// 更新成员信息 (已优化: 增加普通成员编辑自己信息的权限)
export const updateMember = async (
  memberId: number,
  userId: number,
  data: Partial<Omit<Member, 'id' | 'family_id' | 'created_at'>>
): Promise<Member | null> => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [memberRows] = await connection.execute<RowDataPacket[]>('SELECT family_id FROM members WHERE id = ?', [memberId]);
        if (memberRows.length === 0) {
            await connection.rollback();
            return null; // 成员不存在
        }
        const familyId = memberRows[0].family_id;

        // --- 权限检查逻辑重构 ---
        const [relationRows] = await connection.execute<RowDataPacket[]>(
            'SELECT role, member_id FROM family_user_relations WHERE user_id = ? AND family_id = ?',
            [userId, familyId]
        );

        if (relationRows.length === 0) {
            await connection.rollback();
            throw new Error('User does not belong to this family');
        }
        
        const userRelation = relationRows[0];
        const userRole = userRelation.role;
        const userLinkedMemberId = userRelation.member_id; // 当前登录用户关联的成员ID

        // 检查是否为管理员或编辑
        const isAdminOrEditor = ['admin', 'editor'].includes(userRole);
        // 检查是否在修改自己的信息 (前提是用户已关联一个成员)
        const isEditingSelf = userLinkedMemberId !== null && userLinkedMemberId === memberId;
        
        // TODO: 未来可扩展: 检查是否在修改直系亲属
        // const isEditingDirectRelative = await checkIsDirectRelative(userLinkedMemberId, memberId, connection);

        if (!isAdminOrEditor && !isEditingSelf) {
            await connection.rollback();
            throw new Error('User does not have permission to edit this member');
        }
        // --- 权限检查结束 ---


        // 构建更新语句
        const fields = ['name', 'gender', 'status', 'birth_date', 'death_date', 'father_id', 'mother_id', 'spouse_id', 'phone', 'wechat_id', 'original_address', 'current_address', 'occupation'];
        const updates: string[] = [];
        const params: any[] = [];
        
        for (const field of fields) {
            if ((data as any)[field] !== undefined) {
                updates.push(`${field} = ?`);
                params.push((data as any)[field]);
            }
        }

        if (updates.length === 0) {
            await connection.rollback();
            const [currentMember] = await connection.execute<RowDataPacket[]>('SELECT * FROM members WHERE id = ?', [memberId]);
            return currentMember[0] as Member;
        }

        params.push(memberId);
        await connection.execute(
            `UPDATE members SET ${updates.join(', ')} WHERE id = ?`,
            params
        );
        
        const [updatedRows] = await connection.execute<RowDataPacket[]>('SELECT * FROM members WHERE id = ?', [memberId]);
        
        await connection.commit();
        return updatedRows[0] as Member;

    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

// 删除成员 (已修正: 权限验证和关系清理)
export const deleteMember = async (memberId: number, userId: number): Promise<boolean> => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [memberRows] = await connection.execute<RowDataPacket[]>('SELECT family_id FROM members WHERE id = ?', [memberId]);
        if (memberRows.length === 0) {
            await connection.rollback();
            return false;
        }
        const familyId = memberRows[0].family_id;

        const [relationRows] = await connection.execute<RowDataPacket[]>(
            'SELECT role FROM family_user_relations WHERE user_id = ? AND family_id = ?',
            [userId, familyId]
        );
        if (relationRows.length === 0 || !['admin', 'editor'].includes(relationRows[0].role)) {
            await connection.rollback();
            throw new Error('User does not have permission to delete members');
        }

        // 在删除前清理关系
        await connection.execute('UPDATE members SET spouse_id = NULL WHERE spouse_id = ?', [memberId]);
        await connection.execute('UPDATE family_user_relations SET member_id = NULL WHERE member_id = ?', [memberId]);
        
        const [deleteResult] = await connection.execute<OkPacket>('DELETE FROM members WHERE id = ?', [memberId]);
        
        await connection.commit();
        return deleteResult.affectedRows > 0;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};


// 添加新成员 (已修正: 统一的添加逻辑)
export const addMember = async (
  familyId: number,
  userId: number,
  data: Omit<Member, 'id' | 'family_id' | 'created_at'>
): Promise<Member | null> => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 验证用户是否有权限
    const [roleRows] = await connection.execute<RowDataPacket[]>(
      `SELECT role FROM family_user_relations
       WHERE family_id = ? AND user_id = ? AND role IN ('admin', 'editor')`,
      [familyId, userId]
    );

    if (roleRows.length === 0) {
      await connection.rollback();
      return null; // 无权限
    }

    // 插入新成员
    const [memberResult] = await connection.execute<OkPacket>(
      `INSERT INTO members (family_id, name, gender, status, birth_date, death_date, father_id, mother_id, spouse_id, phone, wechat_id, original_address, current_address, occupation, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        familyId, data.name, data.gender, data.status || 'alive',
        data.birth_date || null, data.death_date || null,
        data.father_id || null, data.mother_id || null, data.spouse_id || null,
        data.phone || null, data.wechat_id || null, data.original_address || null,
        data.current_address || null, data.occupation || null
      ]
    );
    
    const memberId = memberResult.insertId;
    const [newMemberRows] = await connection.execute<RowDataPacket[]>('SELECT * FROM members WHERE id = ?', [memberId]);
    
    await connection.commit();
    return newMemberRows[0] as Member;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};
