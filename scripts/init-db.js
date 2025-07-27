// init-db.js
import dotenv from 'dotenv';
dotenv.config(); // 在最开始加载环境变量
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

import mysql from 'mysql2/promise';

const run = async () => {
  console.log('开始执行数据库初始化脚本...');

  const dbConfig = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306, // 新增：读取端口号
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true, // 关键：允许一次执行多条SQL语句
  };

  let connection;
  try {
    // 1. 连接到MySQL服务（不指定具体数据库）
    console.log(`正在连接到MySQL服务: ${dbConfig.host}:${dbConfig.port}...`);
    connection = await mysql.createConnection(dbConfig);
    console.log('MySQL服务连接成功！');

    // 2. 读取SQL文件内容
    const sqlFilePath = path.join(process.cwd(), 'db_scripts', 'schema.sql');
    const sqlScript = fs.readFileSync(sqlFilePath, 'utf-8');
    console.log('成功读取 schema.sql 文件。');

    // 3. 执行SQL脚本
    console.log('正在执行SQL脚本以创建数据库和表...');
    await connection.query(sqlScript);
    console.log('✅ 数据库、表结构和初始数据已成功创建！');

  } catch (error) {
    console.error('❌ 数据库初始化失败:', error);
    process.exit(1); // 如果失败，则退出进程
  } finally {
    if (connection) {
      await connection.end(); // 4. 关闭连接
      console.log('数据库连接已关闭。');
    }
  }
};

run();
