// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const db = require('./db');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// --- 认证中间件 (保持不变) ---
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

// --- 登录API (保持不变) ---
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

// --- 家族管理API (保持不变) ---
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

// --- 族谱数据API (保持不变) ---
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

// 创建成员API (已改造)
app.post('/api/families/:familyId/members', authenticateToken, async (req, res) => {
  const { familyId } = req.params;
  const userId = req.user.userId;
  // 接收新成员信息，包括可选的父/母ID
  const { name, gender, birth_date, father_id, mother_id } = req.body;

  if (!name || !gender) {
    return res.status(400).json({ message: '姓名和性别不能为空' });
  }

  try {
    // 1. 权限检查：确认当前用户是该家族的管理员或编辑者
    const [relations] = await db.query(
      'SELECT role FROM family_user_relations WHERE family_id = ? AND user_id = ?',
      [familyId, userId]
    );
    if (relations.length === 0 || !['admin', 'editor'].includes(relations[0].role)) {
      return res.status(403).json({ message: '您没有权限在此家族中添加成员' });
    }
    
    // 2. 如果是添加始祖 (没有父/母ID)，则检查是否已存在
    if (!father_id && !mother_id) {
        const [roots] = await db.query('SELECT id FROM members WHERE family_id = ? AND father_id IS NULL AND mother_id IS NULL', [familyId]);
        if(roots.length > 0) {
          return res.status(400).json({ message: '该家族已存在始祖，无法重复添加' });
        }
    }

    // 3. 插入数据到 members 表
    const sql = 'INSERT INTO members (family_id, name, gender, birth_date, father_id, mother_id) VALUES (?, ?, ?, ?, ?, ?)';
    const [result] = await db.query(sql, [familyId, name, gender, birth_date || null, father_id || null, mother_id || null]);

    res.status(201).json({
      code: 201,
      message: '成员创建成功',
      data: { id: result.insertId }
    });

  } catch (error) {
    console.error(`在家族(id=${familyId})中创建成员失败:`, error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 获取单个成员详情API (保持不变)
app.get('/api/members/:memberId', authenticateToken, async (req, res) => {
    const { memberId } = req.params;
    const userId = req.user.userId;
    try {
        const [rows] = await db.query('SELECT * FROM members WHERE id = ?', [memberId]);
        if (rows.length === 0) {
            return res.status(404).json({ message: '未找到该成员' });
        }
        const member = rows[0];
        const [relations] = await db.query('SELECT * FROM family_user_relations WHERE family_id = ? AND user_id = ?', [member.family_id, userId]);
        if (relations.length === 0) {
            return res.status(403).json({ message: '无权查看该成员信息' });
        }
        res.json({ code: 200, message: '成功', data: member });
    } catch (error) {
        console.error(`获取成员(id=${memberId})详情失败:`, error);
        res.status(500).json({ message: '服务器内部错误' });
    }
});

// 更新单个成员信息API (保持不变)
app.put('/api/members/:memberId', authenticateToken, async (req, res) => {
    const { memberId } = req.params;
    const userId = req.user.userId;
    const memberData = req.body;
    try {
        const [members] = await db.query('SELECT family_id FROM members WHERE id = ?', [memberId]);
        if (members.length === 0) {
            return res.status(404).json({ message: '未找到要更新的成员' });
        }
        const familyId = members[0].family_id;
        const [relations] = await db.query('SELECT role FROM family_user_relations WHERE family_id = ? AND user_id = ?', [familyId, userId]);
        if (relations.length === 0 || !['admin', 'editor'].includes(relations[0].role)) {
            return res.status(403).json({ message: '您没有权限修改该成员信息' });
        }
        const fields = ['name', 'gender', 'status', 'birth_date', 'death_date', 'phone', 'wechat_id', 'original_address', 'current_address', 'occupation'];
        const updateFields = [];
        const updateValues = [];
        fields.forEach(field => {
            if (memberData[field] !== undefined) {
                updateFields.push(`${field} = ?`);
                updateValues.push(memberData[field]);
            }
        });
        if (updateFields.length === 0) {
            return res.status(400).json({ message: '没有要更新的内容' });
        }
        updateValues.push(memberId);
        const sql = `UPDATE members SET ${updateFields.join(', ')} WHERE id = ?`;
        await db.query(sql, updateValues);
        res.json({ code: 200, message: '更新成功' });
    } catch (error) {
        console.error(`更新成员(id=${memberId})信息失败:`, error);
        res.status(500).json({ message: '服务器内部错误' });
    }
});


// buildTree 辅助函数 (保持不变)
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

app.listen(PORT, () => {
  console.log(`清风族谱后端服务已启动，正在监听 http://localhost:${PORT}`);
});
