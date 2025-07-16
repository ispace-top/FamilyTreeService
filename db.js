// db.js
const mysql = require('mysql2/promise');
require('dotenv').config(); // 确保环境变量被加载

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306, // 新增：从环境变量读取端口
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'family_tree',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

console.log(`数据库连接池已创建，目标主机: ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 3306}`);

module.exports = pool;