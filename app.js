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

// --- 认证中间件 (Authentication Middleware) ---
// 这是一个“守卫”，所有需要登录才能访问的API，都需要先经过它
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // 格式: "Bearer TOKEN"

  if (token == null) {
    return res.sendStatus(401); // Unauthorized: 请求没有token
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.sendStatus(403); // Forbidden: token无效或已过期
    }
    // 将解码后的用户信息附加到请求对象上，方便后续路由使用
    req.user = user;
    next(); // 通过验证，放行到下一个路由
  });
};


// --- 登录API (无需认证) ---
app.post('/api/auth/login', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ message: '缺少登录凭证code' });

    const wechatApiUrl = `https://api.weixin.qq.com/sns/jscode2session`;
    const params = {
      appid: process.env.WECHAT_APPID,
      secret: process.env.WECHAT_APPSECRET,
      js_code: code,
      grant_type: 'authorization_code'
    };
    const { data: wechatData } = await axios.get(wechatApiUrl, { params });

    if (!wechatData.openid) {
      return res.status(500).json({ message: '从微信获取openid失败', error: wechatData });
    }

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

    const token = jwt.sign(
      { userId: user.id, openid: user.openid },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ code: 200, message: '登录成功', data: { token } });
  } catch (error) {
    console.error('登录API出错:', error.message);
    res.status(500).json({ message: '服务器内部错误' });
  }
});


// --- 家族管理API (需要认证) ---

// 获取当前用户的所有家族列表
app.get('/api/user/families', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const sql = `
      SELECT f.id, f.name, f.description, r.role
      FROM families f
      JOIN family_user_relations r ON f.id = r.family_id
      WHERE r.user_id = ?
    `;
    const [families] = await db.query(sql, [userId]);
    res.json({ code: 200, message: '成功', data: families });
  } catch (error) {
    console.error('获取用户家族列表失败:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 创建一个新家族
app.post('/api/families', authenticateToken, async (req, res) => {
  const { name, description } = req.body;
  const creatorId = req.user.userId;

  if (!name) {
    return res.status(400).json({ message: '家族名称不能为空' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction(); // 开始事务

    // 1. 在 families 表中创建家族
    const [familyResult] = await connection.query(
      'INSERT INTO families (name, description, creator_id) VALUES (?, ?, ?)',
      [name, description, creatorId]
    );
    const familyId = familyResult.insertId;

    // 2. 在 relations 表中将创建者设为管理员
    await connection.query(
      'INSERT INTO family_user_relations (family_id, user_id, role) VALUES (?, ?, ?)',
      [familyId, creatorId, 'admin']
    );

    await connection.commit(); // 提交事务
    res.status(201).json({ code: 201, message: '家族创建成功', data: { id: familyId, name, description } });

  } catch (error) {
    await connection.rollback(); // 出错则回滚
    console.error('创建家族失败:', error);
    res.status(500).json({ message: '服务器内部错误' });
  } finally {
    connection.release(); // 释放连接
  }
});


// --- 族谱数据API (需要认证) ---

// 获取指定家族的族谱树
// 注意：路由从 /api/family/1/tree 变为了 /api/families/:familyId/tree
app.get('/api/families/:familyId/tree', authenticateToken, async (req, res) => {
  const { familyId } = req.params;
  const userId = req.user.userId;

  try {
    // 权限检查：确认当前用户是否属于该家族
    const [relations] = await db.query(
      'SELECT * FROM family_user_relations WHERE family_id = ? AND user_id = ?',
      [familyId, userId]
    );
    if (relations.length === 0) {
      return res.status(403).json({ message: '无权访问该家族' });
    }

    // 权限通过，获取数据
    const [rows] = await db.query('SELECT * FROM members WHERE family_id = ?', [familyId]);
    const tree = buildTree(rows); // 使用之前的buildTree函数

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

