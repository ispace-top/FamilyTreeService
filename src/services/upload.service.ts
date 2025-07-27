// src/services/upload.service.ts
import COS from 'cos-nodejs-sdk-v5';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Request } from 'express';
import util from 'util';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 定义环境变量类型
interface UploadConfig {
  useCOS: boolean;
  cos?: COS;
  serverUrl: string;
  maxFileSize: number;
  allowedMimeTypes: string[];
}

// 定义返回结果类型
interface UploadResult {
  success: boolean;
  url?: string;
  error?: string;
  fileName?: string;
}

// 初始化配置
const config: UploadConfig = {
  useCOS: !!process.env.TENCENT_COS_SECRET_ID && !!process.env.TENCENT_COS_SECRET_KEY,
  serverUrl: process.env.SERVER_PUBLIC_URL || 'http://localhost:3000',
  maxFileSize: 10 * 1024 * 1024, // 10MB
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
};

// 初始化COS客户端
let cos: COS | undefined;
if (config.useCOS && process.env.TENCENT_COS_SECRET_ID && process.env.TENCENT_COS_SECRET_KEY) {
  cos = new COS({
    SecretId: process.env.TENCENT_COS_SECRET_ID,
    SecretKey: process.env.TENCENT_COS_SECRET_KEY,
  });
  console.log('检测到COS配置，文件上传将使用腾讯云COS');
} else {
  console.log('未检测到COS配置，文件上传将使用本地存储');
}

/**
 * 文件验证函数
 * @param file - 上传的文件对象
 * @returns 验证结果
 */
const validateFile = (file: Express.Multer.File): { valid: boolean; message?: string } => {
  // 验证文件大小
  if (file.size > config.maxFileSize) {
    return {
      valid: false,
      message: `文件大小超过限制，最大支持${config.maxFileSize / (1024 * 1024)}MB`
    };
  }

  // 验证MIME类型
  if (!config.allowedMimeTypes.includes(file.mimetype)) {
    return {
      valid: false,
      message: `不支持的文件类型，允许的类型: ${config.allowedMimeTypes.join(', ')}`
    };
  }

  return { valid: true };
};

/**
 * 生成唯一文件名
 * @param originalName - 原始文件名
 * @returns 唯一文件名
 */
const generateUniqueFileName = (originalName: string): string => {
  const fileExtension = path.extname(originalName).toLowerCase();
  const fileName = crypto.randomBytes(16).toString('hex');
  return `${fileName}${fileExtension}`;
};

/**
 * 上传到腾讯云COS
 * @param file - 上传的文件对象
 * @returns 上传结果
 */
const uploadToCOS = async (file: Express.Multer.File): Promise<UploadResult> => {
  if (!cos || !process.env.TENCENT_COS_BUCKET || !process.env.TENCENT_COS_REGION) {
    return {
      success: false,
      error: 'COS配置不完整，无法使用COS上传'
    };
  }

  try {
    const fileName = generateUniqueFileName(file.originalname);
    const putObjectPromise = util.promisify(cos.putObject).bind(cos);
    await putObjectPromise({
      Bucket: process.env.TENCENT_COS_BUCKET,
      Region: process.env.TENCENT_COS_REGION,
      Key: `uploads/${fileName}`,
      Body: file.buffer,
      ContentType: file.mimetype
    });

    const fileUrl = `${process.env.TENCENT_COS_URL_PREFIX || `https://${process.env.TENCENT_COS_BUCKET}.cos.${process.env.TENCENT_COS_REGION}.myqcloud.com`}/uploads/${fileName}`;
    return {
      success: true,
      url: fileUrl,
      fileName
    }
  } catch (error) {
    console.error('COS上传错误:', error);
    return {
      success: false,
      error: `上传失败: ${error instanceof Error ? error.message : String(error)}`
    };
  }
};

/**
 * 上传到本地存储
 * @param file - 上传的文件对象
 * @returns 上传结果
 */
const uploadToLocal = async (file: Express.Multer.File): Promise<UploadResult> => {
  try {
    const storagePath = process.env.LOCAL_STORAGE_PATH || path.join(__dirname, '../../uploads/images');
    // 确保目录存在
    fs.mkdirSync(storagePath, { recursive: true });

    const fileName = generateUniqueFileName(file.originalname);
    const filePath = path.join(storagePath, fileName);

    fs.writeFileSync(filePath, file.buffer);
    
    // --- 修正：直接使用 SERVER_PUBLIC_URL，不再拼接端口号 ---
    const fileUrl = `${config.serverUrl}/uploads/images/${fileName}`;
    
    return {
      success: true,
      url: fileUrl,
      fileName
    };
  } catch (error) {
    console.error('本地上传错误:', error);
    return {
      success: false,
      error: `上传失败: ${error instanceof Error ? error.message : String(error)}`
    };
  }
};

/**
 * 统一文件上传函数
 * @param file - 上传的文件对象
 * @returns 上传结果
 */
const uploadFile = async (file: Express.Multer.File): Promise<UploadResult> => {
  // 验证文件
  const validation = validateFile(file);
  if (!validation.valid) {
    return {
      success: false,
      error: validation.message
    };
  }

  try {
    if (config.useCOS && cos) {
      return await uploadToCOS(file);
    } else {
      return await uploadToLocal(file);
    }
  } catch (error) {
    console.error('文件上传错误:', error);
    return {
      success: false,
      error: `上传过程中发生错误: ${error instanceof Error ? error.message : String(error)}`
    };
  }
};

export default { uploadFile, validateFile };
