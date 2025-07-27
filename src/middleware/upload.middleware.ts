// src/middleware/upload.middleware.ts
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// 配置存储引擎，这里使用内存存储，以便后续可以灵活地传递给 COS 或本地服务
const storage = multer.memoryStorage();

// 确保上传目录存在 (仅在本地存储时需要，这是一个安全措施)
const uploadDir = path.join(process.cwd(), 'uploads/images');
if (!process.env.TENCENT_COS_SECRET_ID) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// 文件过滤器，确保只接受图片类型的文件
const fileFilter = (req: any, file: any, cb: any) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Not an image! Please upload only images.'), false);
    }
};

// 初始化 multer 并导出
export const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 1024 * 1024 * 10 // 限制文件大小为 5MB
    }
});
