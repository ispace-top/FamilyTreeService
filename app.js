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

// --- 登录与家族API (保持不变) ---
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

// --- 新增：邀请管理API ---

// 1. 创建一个邀请链接 (需要认证)
app.post('/api/families/:familyId/invitations', authenticateToken, async (req, res) => {
    const { familyId } = req.params;
    const inviterId = req.user.userId;
    try {
        // 权限检查：只有家族成员才能创建邀请
        const [relations] = await db.query('SELECT * FROM family_user_relations WHERE family_id = ? AND user_id = ?', [familyId, inviterId]);
        if (relations.length === 0) {
            return res.status(403).json({ message: '您不属于该家族，无法创建邀请' });
        }

        // 生成一个唯一的、安全的邀请令牌
        const token = crypto.randomBytes(32).toString('hex');
        // 设置邀请链接1小时后过期
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

        const sql = 'INSERT INTO invitations (family_id, inviter_id, token, expires_at) VALUES (?, ?, ?, ?)';
        await db.query(sql, [familyId, inviterId, token, expiresAt]);

        res.status(201).json({ code: 201, message: '邀请创建成功', data: { token } });

    } catch (error) {
        console.error('创建邀请失败:', error);
        res.status(500).json({ message: '服务器内部错误' });
    }
});

// 2. 获取邀请信息 (无需认证，供被邀请者查看)
app.get('/api/invitations/:token', async (req, res) => {
    const { token } = req.params;
    try {
        const sql = `
            SELECT i.status, i.expires_at, f.name as familyName, u.nickname as inviterName
            FROM invitations i
            JOIN families f ON i.family_id = f.id
            JOIN users u ON i.inviter_id = u.id
            WHERE i.token = ?
        `;
        const [invitations] = await db.query(sql, [token]);

        if (invitations.length === 0) {
            return res.status(404).json({ message: '邀请链接无效' });
        }
        const invitation = invitations[0];
        if (invitation.status !== 'active') {
            return res.status(410).json({ message: `邀请链接已${invitation.status === 'used' ? '被使用' : '过期'}` });
        }
        if (new Date(invitation.expires_at) < new Date()) {
            // 如果过期了，顺便更新一下数据库状态
            await db.query("UPDATE invitations SET status = 'expired' WHERE token = ?", [token]);
            return res.status(410).json({ message: '邀请链接已过期' });
        }
        
        res.json({ code: 200, message: '成功', data: { familyName: invitation.familyName, inviterName: invitation.inviterName } });

    } catch (error) {
        console.error('获取邀请信息失败:', error);
        res.status(500).json({ message: '服务器内部错误' });
    }
});

// 3. 接受邀请并加入家族 (无需认证)
app.post('/api/invitations/:token/join', async (req, res) => {
    const { token } = req.params;
    const { code, name, gender, birth_date } = req.body; // 接收小程序登录code和新成员信息

    if (!code || !name || !gender) {
        return res.status(400).json({ message: '缺少必要信息' });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // 1. 验证邀请的有效性 (加锁，防止并发问题)
        const [invitations] = await connection.query("SELECT * FROM invitations WHERE token = ? AND status = 'active' AND expires_at > NOW() FOR UPDATE", [token]);
        if (invitations.length === 0) {
            throw new Error('邀请链接无效或已过期');
        }
        const invitation = invitations[0];
        const { family_id } = invitation;

        // 2. 执行登录/注册流程，获取用户信息
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

        // 3. 检查用户是否已在该家族中
        const [relations] = await connection.query('SELECT * FROM family_user_relations WHERE family_id = ? AND user_id = ?', [family_id, userId]);
        if (relations.length > 0) {
            throw new Error('您已经是该家族的成员了');
        }

        // 4. 创建新成员记录
        const [memberResult] = await connection.query('INSERT INTO members (family_id, name, gender, birth_date) VALUES (?, ?, ?, ?)', [family_id, name, gender, birth_date || null]);
        
        // 5. 建立用户与家族的关系
        await connection.query('INSERT INTO family_user_relations (family_id, user_id, role) VALUES (?, ?, ?)', [family_id, userId, 'member']);

        // 6. 将邀请设置为已使用
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

// --- 新增：全能搜索API ---
app.get('/api/families/:familyId/search-all', authenticateToken, async (req, res) => {
    const { familyId } = req.params;
    const { keyword } = req.query; // 接收关键词
    const userId = req.user.userId;

    if (!keyword || !keyword.trim()) {
        return res.json({ code: 200, message: '成功', data: [] });
    }

    try {
        // 1. 权限检查
        const [relations] = await db.query('SELECT * FROM family_user_relations WHERE family_id = ? AND user_id = ?', [familyId, userId]);
        if (relations.length === 0) {
            return res.status(403).json({ message: '无权在此家族中搜索' });
        }

        // 2. 构建SQL查询
        const searchTerm = `%${keyword}%`;
        const sql = `
            SELECT id, name, gender, birth_date, current_address 
            FROM members 
            WHERE 
                family_id = ? AND (
                    name LIKE ? OR 
                    original_address LIKE ? OR 
                    current_address LIKE ? OR
                    occupation LIKE ?
                )
        `;
        const [results] = await db.query(sql, [familyId, searchTerm, searchTerm, searchTerm, searchTerm]);

        res.json({ code: 200, message: '成功', data: results });

    } catch (error) {
        console.error('全能搜索失败:', error);
        res.status(500).json({ message: '服务器内部错误' });
    }
});


// --- 其他API (保持不变) ---
// ... (为了简洁，省略这部分代码)


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
  console.log(`清风族谱后端服务已启动，正在监听 http://11.2.231.255:${PORT}`);
});
