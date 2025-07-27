import pool from '../config/database.js';
import { RowDataPacket, OkPacket } from 'mysql2/promise';

// 定义成员的基本数据结构
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
  phone?: string;
  wechat_id?: string;
  original_address?: string;
  current_address?: string;
  occupation?: string;
  avatar?: string;
  photos?: string; // 照片集将以JSON字符串形式存储
  created_at: Date;
}

// 定义获取成员详情时返回的扩展数据结构
export interface MemberDetails extends Member {
    spouses?: Partial<Member>[];
    father?: Partial<Member>;
    mother?: Partial<Member>;
    children?: Partial<Member>[];
    user?: {
        nickname: string;
        avatar_url: string;
    };
    is_linked: boolean;
}

// 通过ID获取成员的完整详细信息
export const getMemberById = async (memberId: number, userId: number): Promise<MemberDetails | null> => {
  const [memberRows] = await pool.execute<RowDataPacket[]>('SELECT * FROM members WHERE id = ?', [memberId]);
  if (memberRows.length === 0) {
    return null;
  }
  const member: MemberDetails = memberRows[0] as MemberDetails;

  // 权限检查：确保当前用户属于该家族
  const [permissionRows] = await pool.execute<RowDataPacket[]>(
    'SELECT 1 FROM family_user_relations WHERE family_id = ? AND user_id = ?',
    [member.family_id, userId]
  );
  if (permissionRows.length === 0) {
    throw new Error('No permission to access this member');
  }
  
  // 查询配偶信息
  const [spouseRelations] = await pool.execute<RowDataPacket[]>(
    'SELECT member1_id, member2_id FROM spouse_relations WHERE member1_id = ? OR member2_id = ?',
    [memberId, memberId]
  );
  const spouseIds = spouseRelations.map(rel => (rel.member1_id === memberId ? rel.member2_id : rel.member1_id));
  if (spouseIds.length > 0) {
    const [spouseRows] = await pool.query<RowDataPacket[]>('SELECT id, name, gender, status FROM members WHERE id IN (?)', [spouseIds]);
    member.spouses = spouseRows as Partial<Member>[];
  } else {
    member.spouses = [];
  }

  // 查询父母信息
  if (member.father_id) {
    const [fatherRows] = await pool.execute<RowDataPacket[]>('SELECT id, name, gender, status FROM members WHERE id = ?', [member.father_id]);
    if (fatherRows.length > 0) member.father = fatherRows[0] as Partial<Member>;
  }
  if (member.mother_id) {
    const [motherRows] = await pool.execute<RowDataPacket[]>('SELECT id, name, gender, status FROM members WHERE id = ?', [member.mother_id]);
    if (motherRows.length > 0) member.mother = motherRows[0] as Partial<Member>;
  }

  // 查询子女信息
  const [childrenRows] = await pool.execute<RowDataPacket[]>('SELECT id, name, gender, status FROM members WHERE father_id = ? OR mother_id = ?', [memberId, memberId]);
  member.children = childrenRows as Partial<Member>[];

  // 查询绑定的微信用户信息
  const [userRelationRows] = await pool.execute<RowDataPacket[]>(
    `SELECT u.nickname, u.avatar_url FROM users u JOIN family_user_relations r ON u.id = r.user_id WHERE r.member_id = ?`,
    [memberId]
  );
  if (userRelationRows.length > 0) {
    member.user = userRelationRows[0] as { nickname: string; avatar_url: string; };
  }
  member.is_linked = !!member.user;

  return member;
};

// 更新成员信息
export const updateMember = async (memberId: number, userId: number, data: Partial<Omit<Member, 'id' | 'family_id' | 'created_at'>>): Promise<Member | null> => {
    const { canEdit } = await checkEditPermission(memberId, userId);
    if (!canEdit) {
        throw new Error('User does not have permission to edit this member');
    }
    
    const fields = ['name', 'gender', 'status', 'birth_date', 'death_date', 'father_id', 'mother_id', 'phone', 'wechat_id', 'original_address', 'current_address', 'occupation'];
    const updates: string[] = [];
    const params: any[] = [];
    
    for (const field of fields) {
        if ((data as any)[field] !== undefined) {
            updates.push(`${field} = ?`);
            params.push((data as any)[field]);
        }
    }

    if (updates.length === 0) {
        const [currentMember] = await pool.execute<RowDataPacket[]>('SELECT * FROM members WHERE id = ?', [memberId]);
        return currentMember[0] as Member;
    }

    params.push(memberId);
    await pool.execute(`UPDATE members SET ${updates.join(', ')} WHERE id = ?`, params);
    const [updatedRows] = await pool.execute<RowDataPacket[]>('SELECT * FROM members WHERE id = ?', [memberId]);
    return updatedRows[0] as Member;
};

// 删除成员
export const deleteMember = async (memberId: number, userId: number): Promise<boolean> => {
    // ... (代码逻辑与之前版本相同，此处省略以保持简洁)
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [memberRows] = await connection.execute<RowDataPacket[]>('SELECT family_id FROM members WHERE id = ?', [memberId]);
        if (memberRows.length === 0) {
            await connection.rollback(); return false;
        }
        const familyId = memberRows[0].family_id;

        const [relationRows] = await connection.execute<RowDataPacket[]>(
            'SELECT role FROM family_user_relations WHERE user_id = ? AND family_id = ?',
            [userId, familyId]
        );
        if (relationRows.length === 0 || !['admin', 'editor'].includes(relationRows[0].role)) {
            await connection.rollback(); throw new Error('User does not have permission to delete members');
        }

        await connection.execute('DELETE FROM spouse_relations WHERE member1_id = ? OR member2_id = ?', [memberId, memberId]);
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

// 添加新成员
export const addMember = async (familyId: number, userId: number, data: Omit<Member, 'id' | 'family_id' | 'created_at'>): Promise<Member | null> => {
    // ... (代码逻辑与之前版本相同，此处省略以保持简洁)
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [roleRows] = await connection.execute<RowDataPacket[]>(
        `SELECT role FROM family_user_relations WHERE family_id = ? AND user_id = ? AND role IN ('admin', 'editor')`,
        [familyId, userId]
        );

        if (roleRows.length === 0) {
        await connection.rollback(); return null;
        }

        if (data.father_id && !data.mother_id) {
            const [spouseRelations] = await connection.execute<RowDataPacket[]>(
                'SELECT member1_id, member2_id FROM spouse_relations WHERE member1_id = ? OR member2_id = ?',
                [data.father_id, data.father_id]
            );
            const spouseIds = spouseRelations.map(rel => (rel.member1_id === data.father_id ? rel.member2_id : rel.member1_id));
            if(spouseIds.length === 1) {
                data.mother_id = spouseIds[0];
            }
        }

        const [memberResult] = await connection.execute<OkPacket>(
        `INSERT INTO members (family_id, name, gender, status, birth_date, death_date, father_id, mother_id, phone, wechat_id, original_address, current_address, occupation, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
            familyId, data.name, data.gender, data.status || 'alive',
            data.birth_date || null, data.death_date || null,
            data.father_id || null, data.mother_id || null,
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

// 关联配偶
export const linkSpouse = async (memberId: number, userId: number, spouseId: number): Promise<boolean> => {
    // ... (代码逻辑与之前版本相同，此处省略以保持简洁)
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [members] = await connection.execute<RowDataPacket[]>(
            'SELECT id, family_id FROM members WHERE id IN (?, ?)',[memberId, spouseId]
        );
        if (members.length !== 2) { throw new Error('One or both members not found.'); }

        const member1 = members.find(m => m.id === memberId);
        const member2 = members.find(m => m.id === spouseId);
        
        if (!member1 || !member2) {
            throw new Error('Could not find one or both members after query.');
        }
        
        if (member1.family_id !== member2.family_id) { throw new Error('Members must be in the same family.'); }

        const familyId = member1.family_id;
        const [relationRows] = await connection.execute<RowDataPacket[]>(
            'SELECT role, member_id FROM family_user_relations WHERE user_id = ? AND family_id = ?', 
            [userId, familyId]
        );
        if (relationRows.length === 0) { throw new Error('User does not belong to this family'); }
        
        const { role, member_id } = relationRows[0];
        const canEdit = ['admin', 'editor'].includes(role) || member_id === memberId;
        if (!canEdit) { throw new Error('User does not have permission to perform this action'); }

        const m1 = Math.min(memberId, spouseId);
        const m2 = Math.max(memberId, spouseId);

        const [result] = await connection.execute<OkPacket>(
            'INSERT INTO spouse_relations (family_id, member1_id, member2_id) VALUES (?, ?, ?)',
            [familyId, m1, m2]
        );
        await connection.commit();
        return result.affectedRows > 0;
    } catch (error) {
        await connection.rollback();
        if (error instanceof Error && 'code' in error && error.code === 'ER_DUP_ENTRY') {
             return true; 
        }
        throw error;
    } finally {
        connection.release();
    }
};

// [私有] 检查用户是否有权限编辑特定成员
const checkEditPermission = async (memberId: number, userId: number): Promise<{canEdit: boolean, familyId: number}> => {
    const [memberRows] = await pool.execute<RowDataPacket[]>('SELECT family_id, father_id, mother_id FROM members WHERE id = ?', [memberId]);
    if (memberRows.length === 0) {
        throw new Error('Member not found');
    }
    const { family_id: familyId, father_id, mother_id } = memberRows[0];

    const [relationRows] = await pool.execute<RowDataPacket[]>(
        'SELECT role, member_id FROM family_user_relations WHERE user_id = ? AND family_id = ?',
        [userId, familyId]
    );
    if (relationRows.length === 0) {
        throw new Error('User does not belong to this family');
    }
    
    const { role, member_id: userLinkedMemberId } = relationRows[0];
    
    if (['admin', 'editor'].includes(role) || userLinkedMemberId === memberId) {
        return { canEdit: true, familyId };
    }

    if(userLinkedMemberId) {
        if (father_id === userLinkedMemberId || mother_id === userLinkedMemberId) {
           return { canEdit: true, familyId };
        }
        const [userAsParentRows] = await pool.execute<RowDataPacket[]>('SELECT id FROM members WHERE id = ? AND (father_id = ? OR mother_id = ?)', [memberId, userLinkedMemberId, userLinkedMemberId]);
        if(userAsParentRows.length > 0) {
            return { canEdit: true, familyId };
        }
    }
    return { canEdit: false, familyId };
}

// 更新成员头像
export const updateMemberAvatar = async (memberId: number, userId: number, avatarUrl: string): Promise<Member | null> => {
    const { canEdit } = await checkEditPermission(memberId, userId);
    if (!canEdit) {
        throw new Error('User does not have permission to edit this member');
    }

    await pool.execute('UPDATE members SET avatar = ? WHERE id = ?', [avatarUrl, memberId]);
    const [updatedRows] = await pool.execute<RowDataPacket[]>('SELECT * FROM members WHERE id = ?', [memberId]);
    return updatedRows[0] as Member;
};

// 为成员添加照片
export const addMemberPhoto = async (memberId: number, userId: number, photoUrl: string): Promise<string[]> => {
    const { canEdit } = await checkEditPermission(memberId, userId);
     if (!canEdit) {
        throw new Error('User does not have permission to edit this member');
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [memberRows] = await connection.execute<RowDataPacket[]>('SELECT photos FROM members WHERE id = ? FOR UPDATE', [memberId]);
        const currentPhotosRaw = memberRows[0]?.photos;
        let photos: string[] = [];
        if (currentPhotosRaw) {
            try {
                photos = JSON.parse(currentPhotosRaw);
            } catch (e) { /* ignore invalid JSON */ }
        }
        
        photos.push(photoUrl);
        
        await connection.execute('UPDATE members SET photos = ? WHERE id = ?', [JSON.stringify(photos), memberId]);
        
        await connection.commit();
        return photos;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};
