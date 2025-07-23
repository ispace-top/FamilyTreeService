import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { testConnection } from './config/database.js';
import authRoutes from './routes/auth.routes.js';
import familyRoutes from './routes/family.routes.js';
import memberRoutes from './routes/member.routes.js';
import userRoutes from './routes/user.routes.js';
// 加载环境变量
dotenv.config();
// 初始化Express应用
const app = express();
const PORT = process.env.PORT || 3000;
// 连接数据库
testConnection();
// 配置中间件
app.use(cors());
app.use(express.json());
// 注册路由
app.use('/api/auth', authRoutes);
app.use('/api/families', familyRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/user', userRoutes);
// 错误处理中间件
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: '服务器内部错误', error: err.message });
});
// 启动服务器
app.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
});
export default app;
//# sourceMappingURL=index.js.map