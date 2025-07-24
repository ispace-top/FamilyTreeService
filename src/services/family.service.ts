import pool from '../config/database.js';
import { RowDataPacket, OkPacket } from 'mysql2/promise';
import { Member } from './member.service.js';

// --- 文件中其他函数保持不变 ---

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

    // 添加初始家族成员
    const [memberResult] = await connection.execute<OkPacket>(
      `INSERT INTO members (family_id, name, gender, created_at)
       VALUES (?, ?, ?, NOW())`,
      [familyId, '家族创始人', 'male']
    );
    const memberId = memberResult.insertId;

    // 将初始成员添加到家族成员关系表
    await connection.execute<OkPacket>(
      'INSERT INTO family_members (user_id, family_id, role_id, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())',
      [creatorId, familyId, adminRoleId]
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

// ... (文件中其他函数如 updateFamily, deleteFamily 等保持不变) ...

// --- 以下是 getFamilyTree 函数的完整优化版本 ---

/**
 * 获取并构建家族的树状结构数据
 * @param familyId 家族ID
 * @param userId   当前用户ID，用于权限校验
 * @returns 包含家族基本信息和树状成员数据的对象
 */
export const getFamilyTree = async (familyId: number, userId: number): Promise<any> => {
  // 1. 获取家族基本信息
  const [familyRows] = await pool.query<RowDataPacket[]>('SELECT id, name FROM families WHERE id = ?', [familyId]);
  if (familyRows.length === 0) {
    throw new Error('家族不存在');
  }
  const family = familyRows[0];

  // 2. 检查用户是否有权访问该家族 (保留了您的原始校验逻辑)
  const [relations] = await pool.query(
  `SELECT fur.id FROM family_user_relations fur WHERE fur.family_id = ? AND fur.user_id = ?
   UNION
   SELECT f.id FROM families f WHERE f.id = ? AND f.creator_id = ?`,
  [familyId, userId, familyId, userId]
  );
  if ((relations as any[]).length === 0) {
    throw new Error('无权访问该家族');
  }

  // 3. 获取家族所有成员
  const [memberRows] = await pool.query<RowDataPacket[]>('SELECT * FROM members WHERE family_id = ?', [familyId]);
  const members = memberRows as Member[];
  if (members.length === 0) {
    return { id: family.id, name: family.name, children: [] };
  }

  // 4. 构建家族树结构 (核心优化部分)
  const memberMap = new Map<number, any>();
  const roots: any[] = [];
  
  // 第一次循环: 将所有成员放入Map中，方便快速查找，并初始化children数组
  members.forEach(member => {
    memberMap.set(member.id, { ...member, children: [] });
  });

  // 第二次循环: 构建层级关系和配偶关系
  members.forEach(member => {
    const currentNode = memberMap.get(member.id);

    // 关联配偶信息
    if (member.spouse_id && memberMap.has(member.spouse_id)) {
      const spouseNode = memberMap.get(member.spouse_id);
      // 为了简化数据结构，只将关键信息附加到spouse属性上
      currentNode.spouse = { 
        id: spouseNode.id, 
        name: spouseNode.name, 
        gender: spouseNode.gender,
        status: spouseNode.status 
      };
    }
    
    // 关联父子关系 (核心修正：使用 father_id)
    // 这里我们以父系为准来构建树，您也可以根据需求调整为母系或更复杂的逻辑
    if (member.father_id && memberMap.has(member.father_id)) {
      const parentNode = memberMap.get(member.father_id);
      parentNode.children.push(currentNode);
    } else {
      // 如果没有父亲信息，则认为该成员是一个潜在的始祖（根节点）
      roots.push(currentNode);
    }
  });
  
  // 5. 优化根节点列表：如果一对夫妻都是根节点，只保留一个作为代表，避免重复
  const rootIds = new Set(roots.map(r => r.id));
  const finalRoots = roots.filter(r => 
    // 如果一个根节点有配偶，并且其配偶也在根节点列表中，
    // 那么我们只保留ID较小的那一个，以避免在顶层同时渲染夫妻双方
    !(r.spouse_id && rootIds.has(r.spouse_id) && r.id > r.spouse_id)
  );

  return {
    id: family.id,
    name: family.name,
    children: finalRoots
  };
};

