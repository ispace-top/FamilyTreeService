import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer'; // 导入 multer
import { testConnection } from './config/database.js';
import authRoutes from './routes/auth.routes.js';
import familyRoutes from './routes/family.routes.js';
import memberRoutes from './routes/member.routes.js';

// 加载环境变量
dotenv.config();

// 获取当前文件路径，用于静态文件服务
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 初始化Express应用
const app: Express = express();
const PORT = process.env.PORT || 3000;

// 禁用 ETag 缓存，以避免在开发过程中出现 304 Not Modified
app.disable('etag');

// 连接数据库
testConnection();

// 配置中间件
app.use(cors());
app.use(express.json());

// 配置静态文件服务，用于访问上传的图片
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// 注册路由
app.use('/api/auth', authRoutes);
app.use('/api/families', familyRoutes);
app.use('/api/members', memberRoutes);

// --- 新增：专门处理 Multer 错误的中间件 ---
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      // --- 修改：直接使用已知的文件大小限制 ---
      const maxSizeInMB = 10; // 这个值必须与 upload.middleware.ts 中的限制保持一致
      return res.status(400).json({ code: 400, message: `文件过大，请上传小于 ${maxSizeInMB}MB 的图片。` });
    }
    return res.status(400).json({ code: 400, message: `文件上传错误: ${err.message}` });
  }
  // 如果不是 Multer 错误，则传递给下一个错误处理器
  next(err);
});

// 通用错误处理中间件
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ message: '服务器内部错误', error: err.message });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});

export default app;
