// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('./db');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// --- 认证中间件 (Authentication Middleware) ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token == null) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// --- 登录API ---
app.post('/api/auth/login', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ message: '缺少登录凭证code' });
    const wechatApiUrl = `https://api.weixin.qq.com/sns/jscode2session`;
    const params = { appid: process.env.WECHAT_APPID, secret: process.env.WECHAT_APPSECRET, js_code: code, grant_type: 'authorization_code' };
    const { data: wechatData } = await axios.get(wechatApiUrl, { params });
    if (!wechatData.openid) return res.status(500).json({ message: '从微信获取openid失败', error: wechatData });
    const { openid } = wechatData;
    let [users] = await db.query('SELECT * FROM users WHERE openid = ?', [openid]);
    let user;
    if (users.length > 0) {
      user = users[0];
      await db.query('UPDATE users SET last_login_time = NOW() WHERE id = ?', [user.id]);
    } else {
      const [result] = await db.query('INSERT INTO users (openid, last_login_time) VALUES (?, NOW())', [openid]);
      user = { id: result.insertId, openid };
    }
    const token = jwt.sign({ userId: user.id, openid: user.openid }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ code: 200, message: '登录成功', data: { token } });
  } catch (error) {
    console.error('登录API出错:', error.message);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// --- 家族管理API ---
app.get('/api/user/families', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const sql = `SELECT f.id, f.name, f.description, r.role FROM families f JOIN family_user_relations r ON f.id = r.family_id WHERE r.user_id = ?`;
    const [families] = await db.query(sql, [userId]);
    res.json({ code: 200, message: '成功', data: families });
  } catch (error) {
    console.error('获取用户家族列表失败:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});
app.post('/api/families', authenticateToken, async (req, res) => {
  const { name, description } = req.body;
  const creatorId = req.user.userId;
  if (!name) return res.status(400).json({ message: '家族名称不能为空' });
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [familyResult] = await connection.query('INSERT INTO families (name, description, creator_id) VALUES (?, ?, ?)', [name, description, creatorId]);
    const familyId = familyResult.insertId;
    await connection.query('INSERT INTO family_user_relations (family_id, user_id, role) VALUES (?, ?, ?)', [familyId, creatorId, 'admin']);
    await connection.commit();
    res.status(201).json({ code: 201, message: '家族创建成功', data: { id: familyId, name, description } });
  } catch (error) {
    await connection.rollback();
    console.error('创建家族失败:', error);
    res.status(500).json({ message: '服务器内部错误' });
  } finally {
    connection.release();
  }
});

// --- 族谱树API ---
app.get('/api/families/:familyId/tree', authenticateToken, async (req, res) => {
  const { familyId } = req.params;
  const userId = req.user.userId;
  try {
    const [relations] = await db.query('SELECT * FROM family_user_relations WHERE family_id = ? AND user_id = ?', [familyId, userId]);
    if (relations.length === 0) return res.status(403).json({ message: '无权访问该家族' });
    const [rows] = await db.query('SELECT * FROM members WHERE family_id = ?', [familyId]);
    const tree = buildTree(rows);
    if (tree.length > 0) {
      res.json({ code: 200, message: '成功', data: tree[0] });
    } else {
      res.json({ code: 200, message: '成功', data: null });
    }
  } catch (error) {
    console.error('查询家族树失败:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// --- 成员管理API ---
app.post('/api/families/:familyId/members', authenticateToken, async (req, res) => {
  const { familyId } = req.params;
  const userId = req.user.userId;
  const { name, gender, birth_date, father_id, mother_id } = req.body;
  if (!name || !gender) return res.status(400).json({ message: '姓名和性别不能为空' });
  try {
    const [relations] = await db.query('SELECT role FROM family_user_relations WHERE family_id = ? AND user_id = ?', [familyId, userId]);
    if (relations.length === 0 || !['admin', 'editor'].includes(relations[0].role)) return res.status(403).json({ message: '您没有权限在此家族中添加成员' });
    const sql = 'INSERT INTO members (family_id, name, gender, birth_date, father_id, mother_id) VALUES (?, ?, ?, ?, ?, ?)';
    const [result] = await db.query(sql, [familyId, name, gender, birth_date || null, father_id || null, mother_id || null]);
    res.status(201).json({ code: 201, message: '成员创建成功', data: { id: result.insertId } });
  } catch (error) {
    console.error(`在家族(id=${familyId})中创建成员失败:`, error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});
app.get('/api/members/:memberId', authenticateToken, async (req, res) => {
    const { memberId } = req.params;
    const userId = req.user.userId;
    try {
        const [rows] = await db.query('SELECT * FROM members WHERE id = ?', [memberId]);
        if (rows.length === 0) return res.status(404).json({ message: '未找到该成员' });
        const member = rows[0];
        const [relations] = await db.query('SELECT * FROM family_user_relations WHERE family_id = ? AND user_id = ?', [member.family_id, userId]);
        if (relations.length === 0) return res.status(403).json({ message: '无权查看该成员信息' });
        res.json({ code: 200, message: '成功', data: member });
    } catch (error) {
        console.error(`获取成员(id=${memberId})详情失败:`, error);
        res.status(500).json({ message: '服务器内部错误' });
    }
});
app.put('/api/members/:memberId', authenticateToken, async (req, res) => {
    const { memberId } = req.params;
    const userId = req.user.userId;
    const memberData = req.body;
    try {
        const [members] = await db.query('SELECT family_id FROM members WHERE id = ?', [memberId]);
        if (members.length === 0) return res.status(404).json({ message: '未找到要更新的成员' });
        const familyId = members[0].family_id;
        const [relations] = await db.query('SELECT role FROM family_user_relations WHERE family_id = ? AND user_id = ?', [familyId, userId]);
        if (relations.length === 0 || !['admin', 'editor'].includes(relations[0].role)) return res.status(403).json({ message: '您没有权限修改该成员信息' });
        const fields = ['name', 'gender', 'status', 'birth_date', 'death_date', 'phone', 'wechat_id', 'original_address', 'current_address', 'occupation'];
        const updateFields = [];
        const updateValues = [];
        fields.forEach(field => {
            if (memberData[field] !== undefined) {
                updateFields.push(`${field} = ?`);
                updateValues.push(memberData[field]);
            }
        });
        if (updateFields.length === 0) return res.status(400).json({ message: '没有要更新的内容' });
        updateValues.push(memberId);
        const sql = `UPDATE members SET ${updateFields.join(', ')} WHERE id = ?`;
        await db.query(sql, updateValues);
        res.json({ code: 200, message: '更新成功' });
    } catch (error) {
        console.error(`更新成员(id=${memberId})信息失败:`, error);
        res.status(500).json({ message: '服务器内部错误' });
    }
});

// --- 配偶管理API ---
app.get('/api/families/:familyId/members/search', authenticateToken, async (req, res) => {
    const { familyId } = req.params;
    const { name, currentMemberId } = req.query;
    if (!name) return res.json({ code: 200, message: '成功', data: [] });
    try {
        const sql = `SELECT id, name, gender, birth_date FROM members WHERE family_id = ? AND name LIKE ? AND spouse_id IS NULL AND id != ?`;
        const [members] = await db.query(sql, [familyId, `%${name}%`, currentMemberId]);
        res.json({ code: 200, message: '成功', data: members });
    } catch (error) {
        console.error('搜索成员失败:', error);
        res.status(500).json({ message: '服务器内部错误' });
    }
});
app.put('/api/members/:memberId/spouse', authenticateToken, async (req, res) => {
    const { memberId } = req.params;
    const { spouseId } = req.body;
    const userId = req.user.userId;
    if (!spouseId) return res.status(400).json({ message: '缺少配偶ID' });
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [members] = await connection.query('SELECT id, family_id, spouse_id FROM members WHERE id IN (?, ?)', [memberId, spouseId]);
        if (members.length !== 2) throw new Error('一个或多个成员不存在');
        const member1 = members.find(m => m.id == memberId);
        const member2 = members.find(m => m.id == spouseId);
        if (member1.family_id !== member2.family_id) throw new Error('成员不属于同一家族');
        if (member1.spouse_id || member2.spouse_id) throw new Error('一个或多个成员已有配偶');
        const familyId = member1.family_id;
        const [relations] = await connection.query('SELECT role FROM family_user_relations WHERE family_id = ? AND user_id = ?', [familyId, userId]);
        if (relations.length === 0 || !['admin', 'editor'].includes(relations[0].role)) return res.status(403).json({ message: '您没有权限执行此操作' });
        await connection.query('UPDATE members SET spouse_id = ? WHERE id = ?', [spouseId, memberId]);
        await connection.query('UPDATE members SET spouse_id = ? WHERE id = ?', [memberId, spouseId]);
        await connection.commit();
        res.json({ code: 200, message: '配偶关联成功' });
    } catch (error) {
        await connection.rollback();
        console.error('关联配偶失败:', error);
        res.status(500).json({ message: error.message || '服务器内部错误' });
    } finally {
        connection.release();
    }
});

// --- 关系API ---
app.get('/api/members/:memberId/relations', authenticateToken, async (req, res) => {
    const { memberId } = req.params;
    const userId = req.user.userId;
    try {
        const [memberRows] = await db.query('SELECT * FROM members WHERE id = ?', [memberId]);
        if (memberRows.length === 0) return res.status(404).json({ message: '未找到该成员' });
        const member = memberRows[0];
        const [relations] = await db.query('SELECT * FROM family_user_relations WHERE family_id = ? AND user_id = ?', [member.family_id, userId]);
        if (relations.length === 0) return res.status(403).json({ message: '无权查看该成员信息' });
        const relatedIds = [];
        if (member.father_id) relatedIds.push(member.father_id);
        if (member.mother_id) relatedIds.push(member.mother_id);
        if (member.spouse_id) relatedIds.push(member.spouse_id);
        const [childrenRows] = await db.query('SELECT id, name FROM members WHERE father_id = ? OR mother_id = ?', [memberId, memberId]);
        let relatedMembers = {};
        if (relatedIds.length > 0) {
            const [relatedRows] = await db.query('SELECT id, name FROM members WHERE id IN (?)', [relatedIds]);
            relatedRows.forEach(row => { relatedMembers[row.id] = row.name; });
        }
        const result = {
            father: member.father_id ? { id: member.father_id, name: relatedMembers[member.father_id] } : null,
            mother: member.mother_id ? { id: member.mother_id, name: relatedMembers[member.mother_id] } : null,
            spouse: member.spouse_id ? { id: member.spouse_id, name: relatedMembers[member.spouse_id] } : null,
            children: childrenRows
        };
        res.json({ code: 200, message: '成功', data: result });
    } catch (error) {
        console.error(`获取成员(id=${memberId})关系失败:`, error);
        res.status(500).json({ message: '服务器内部错误' });
    }
});

// --- 搜索API ---
app.get('/api/families/:familyId/search-all', authenticateToken, async (req, res) => {
    const { familyId } = req.params;
    const { keyword } = req.query;
    const userId = req.user.userId;
    if (!keyword || !keyword.trim()) return res.json({ code: 200, message: '成功', data: [] });
    try {
        const [relations] = await db.query('SELECT * FROM family_user_relations WHERE family_id = ? AND user_id = ?', [familyId, userId]);
        if (relations.length === 0) return res.status(403).json({ message: '无权在此家族中搜索' });
        const searchTerm = `%${keyword}%`;
        const sql = `SELECT id, name, gender, birth_date, current_address FROM members WHERE family_id = ? AND (name LIKE ? OR original_address LIKE ? OR current_address LIKE ? OR occupation LIKE ?)`;
        const [results] = await db.query(sql, [familyId, searchTerm, searchTerm, searchTerm, searchTerm]);
        res.json({ code: 200, message: '成功', data: results });
    } catch (error) {
        console.error('全能搜索失败:', error);
        res.status(500).json({ message: '服务器内部错误' });
    }
});

// --- 邀请API ---
app.post('/api/families/:familyId/invitations', authenticateToken, async (req, res) => {
    const { familyId } = req.params;
    const inviterId = req.user.userId;
    try {
        const [relations] = await db.query('SELECT * FROM family_user_relations WHERE family_id = ? AND user_id = ?', [familyId, inviterId]);
        if (relations.length === 0) return res.status(403).json({ message: '您不属于该家族，无法创建邀请' });
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
        const sql = 'INSERT INTO invitations (family_id, inviter_id, token, expires_at) VALUES (?, ?, ?, ?)';
        await db.query(sql, [familyId, inviterId, token, expiresAt]);
        res.status(201).json({ code: 201, message: '邀请创建成功', data: { token } });
    } catch (error) {
        console.error('创建邀请失败:', error);
        res.status(500).json({ message: '服务器内部错误' });
    }
});
app.get('/api/invitations/:token', async (req, res) => {
    const { token } = req.params;
    try {
        const sql = `SELECT i.status, i.expires_at, f.name as familyName, u.nickname as inviterName FROM invitations i JOIN families f ON i.family_id = f.id JOIN users u ON i.inviter_id = u.id WHERE i.token = ?`;
        const [invitations] = await db.query(sql, [token]);
        if (invitations.length === 0) return res.status(404).json({ message: '邀请链接无效' });
        const invitation = invitations[0];
        if (invitation.status !== 'active') return res.status(410).json({ message: `邀请链接已${invitation.status === 'used' ? '被使用' : '过期'}` });
        if (new Date(invitation.expires_at) < new Date()) {
            await db.query("UPDATE invitations SET status = 'expired' WHERE token = ?", [token]);
            return res.status(410).json({ message: '邀请链接已过期' });
        }
        res.json({ code: 200, message: '成功', data: { familyName: invitation.familyName, inviterName: invitation.inviterName } });
    } catch (error) {
        console.error('获取邀请信息失败:', error);
        res.status(500).json({ message: '服务器内部错误' });
    }
});
app.post('/api/invitations/:token/join', async (req, res) => {
    const { token } = req.params;
    const { code, name, gender, birth_date } = req.body;
    if (!code || !name || !gender) return res.status(400).json({ message: '缺少必要信息' });
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [invitations] = await connection.query("SELECT * FROM invitations WHERE token = ? AND status = 'active' AND expires_at > NOW() FOR UPDATE", [token]);
        if (invitations.length === 0) throw new Error('邀请链接无效或已过期');
        const invitation = invitations[0];
        const { family_id } = invitation;
        const wechatApiUrl = `https://api.weixin.qq.com/sns/jscode2session`;
        const params = { appid: process.env.WECHAT_APPID, secret: process.env.WECHAT_APPSECRET, js_code: code, grant_type: 'authorization_code' };
        const { data: wechatData } = await axios.get(wechatApiUrl, { params });
        if (!wechatData.openid) throw new Error('从微信获取openid失败');
        let [users] = await connection.query('SELECT * FROM users WHERE openid = ?', [wechatData.openid]);
        let userId;
        if (users.length > 0) {
            userId = users[0].id;
        } else {
            const [result] = await connection.query('INSERT INTO users (openid) VALUES (?)', [wechatData.openid]);
            userId = result.insertId;
        }
        const [relations] = await connection.query('SELECT * FROM family_user_relations WHERE family_id = ? AND user_id = ?', [family_id, userId]);
        if (relations.length > 0) throw new Error('您已经是该家族的成员了');
        await connection.query('INSERT INTO members (family_id, name, gender, birth_date) VALUES (?, ?, ?, ?)', [family_id, name, gender, birth_date || null]);
        await connection.query('INSERT INTO family_user_relations (family_id, user_id, role) VALUES (?, ?, ?)', [family_id, userId, 'member']);
        await connection.query("UPDATE invitations SET status = 'used' WHERE id = ?", [invitation.id]);
        await connection.commit();
        res.status(201).json({ code: 201, message: '成功加入家族' });
    } catch (error) {
        await connection.rollback();
        console.error('加入家族失败:', error);
        res.status(500).json({ message: error.message || '服务器内部错误' });
    } finally {
        connection.release();
    }
});

// --- 权限管理API ---
app.get('/api/families/:familyId/roles', authenticateToken, async (req, res) => {
    const { familyId } = req.params;
    const requesterId = req.user.userId;
    try {
        const [requesterRelations] = await db.query('SELECT role FROM family_user_relations WHERE family_id = ? AND user_id = ?', [familyId, requesterId]);
        if (requesterRelations.length === 0 || requesterRelations[0].role !== 'admin') {
            return res.status(403).json({ message: '只有管理员才能查看成员角色' });
        }
        const sql = `SELECT u.id as userId, u.nickname, u.avatar_url, r.role FROM users u JOIN family_user_relations r ON u.id = r.user_id WHERE r.family_id = ?`;
        const [members] = await db.query(sql, [familyId]);
        res.json({ code: 200, message: '成功', data: members });
    } catch (error) {
        console.error('获取成员角色列表失败:', error);
        res.status(500).json({ message: '服务器内部错误' });
    }
});
app.put('/api/families/:familyId/users/:userId/role', authenticateToken, async (req, res) => {
    const { familyId, userId } = req.params;
    const { role } = req.body;
    const requesterId = req.user.userId;
    if (!['admin', 'editor', 'member'].includes(role)) return res.status(400).json({ message: '无效的角色' });
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [requesterRelations] = await connection.query('SELECT role FROM family_user_relations WHERE family_id = ? AND user_id = ?', [familyId, requesterId]);
        if (requesterRelations.length === 0 || requesterRelations[0].role !== 'admin') throw new Error('只有管理员才能修改角色');
        if (role !== 'admin') {
            const [[{ count }]] = await connection.query('SELECT COUNT(*) as count FROM family_user_relations WHERE family_id = ? AND role = "admin"', [familyId]);
            if (count <= 1) {
                const [targetUser] = await connection.query('SELECT role FROM family_user_relations WHERE family_id = ? AND user_id = ?', [familyId, userId]);
                if (targetUser.length > 0 && targetUser[0].role === 'admin') throw new Error('无法移除最后一位管理员');
            }
        }
        const [updateResult] = await connection.query('UPDATE family_user_relations SET role = ? WHERE family_id = ? AND user_id = ?', [role, familyId, userId]);
        if (updateResult.affectedRows === 0) throw new Error('该用户不在此家族中');
        await connection.commit();
        res.json({ code: 200, message: '角色更新成功' });
    } catch (error) {
        await connection.rollback();
        console.error('更新角色失败:', error);
        res.status(500).json({ message: error.message || '服务器内部错误' });
    } finally {
        connection.release();
    }
});

// --- buildTree 辅助函数 ---
function buildTree(list) {
  if (!list || list.length === 0) return [];
  const map = {};
  const roots = [];
  list.forEach(member => { map[member.id] = { ...member, children: [] }; });
  list.forEach(member => {
    const node = map[member.id];
    if (node.spouse_id && map[node.spouse_id]) {
      const spouseNode = map[node.spouse_id];
      node.spouse = { id: spouseNode.id, name: spouseNode.name, gender: spouseNode.gender, status: spouseNode.status };
    }
    if (node.father_id && map[node.father_id]) {
      map[node.father_id].children.push(node);
    } else if (node.father_id === null) {
      roots.push(node);
    }
  });
  const rootIds = new Set(roots.map(r => r.id));
  return roots.filter(r => !(r.spouse_id && rootIds.has(r.spouse_id) && r.id > r.spouse_id));
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`清风族谱后端服务已启动，正在监听所有网络接口于 http://localhost:${PORT}`);
});
