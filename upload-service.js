// upload-service.js
const COS = require('cos-nodejs-sdk-v5');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 检查是否配置了腾讯云COS
const useCOS = process.env.TENCENT_COS_SECRET_ID && process.env.TENCENT_COS_SECRET_KEY;

let cos;
if (useCOS) {
  cos = new COS({
    SecretId: process.env.TENCENT_COS_SECRET_ID,
    SecretKey: process.env.TENCENT_COS_SECRET_KEY,
  });
  console.log('检测到COS配置，图片上传将使用腾讯云COS。');
} else {
  console.log('未检测到COS配置，图片上传将使用本地存储。');
}

/**
 * 统一的图片上传函数
 * @param {object} file - multer处理后的文件对象
 * @returns {Promise<string>} - 返回图片的公网访问URL
 */
const uploadImage = (file) => {
  if (useCOS) {
    return uploadToCOS(file);
  } else {
    return uploadToLocal(file);
  }
};

// 上传到腾讯云COS
const uploadToCOS = (file) => {
  return new Promise((resolve, reject) => {
    const fileExtension = path.extname(file.originalname);
    const fileName = `${crypto.randomBytes(16).toString('hex')}${fileExtension}`;
    
    cos.putObject({
      Bucket: process.env.TENCENT_COS_BUCKET,
      Region: process.env.TENCENT_COS_REGION,
      Key: fileName, // 文件在存储桶中的路径和名称
      Body: file.buffer,
    }, (err, data) => {
      if (err) {
        console.error('COS上传失败:', err);
        return reject(err);
      }
      // 拼接出完整的公网访问URL
      const fileUrl = `${process.env.TENCENT_COS_URL_PREFIX}/${fileName}`;
      console.log('COS上传成功, URL:', fileUrl);
      resolve(fileUrl);
    });
  });
};

// 上传到服务器本地
const uploadToLocal = (file) => {
  return new Promise((resolve, reject) => {
    try {
      const storagePath = process.env.LOCAL_STORAGE_PATH || 'uploads/images';
      // 确保目录存在
      fs.mkdirSync(storagePath, { recursive: true });

      const fileExtension = path.extname(file.originalname);
      const fileName = `${crypto.randomBytes(16).toString('hex')}${fileExtension}`;
      const filePath = path.join(storagePath, fileName);

      fs.writeFileSync(filePath, file.buffer);
      
      // 拼接出完整的公网访问URL
      const fileUrl = `${process.env.SERVER_PUBLIC_URL}/${storagePath}/${fileName}`;
      console.log('本地上传成功, URL:', fileUrl);
      resolve(fileUrl);
    } catch (error) {
      console.error('本地上传失败:', error);
      reject(error);
    }
  });
};

module.exports = { uploadImage };
