import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();
// 数据库配置
const config = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'family_tree',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};
// 创建数据库连接池
const pool = mysql.createPool(config);
// 测试数据库连接
export const testConnection = async () => {
    try {
        const connection = await pool.getConnection();
        console.log('数据库连接成功');
        connection.release();
    }
    catch (error) {
        console.error('数据库连接失败:', error);
        process.exit(1);
    }
};
// 导出连接池和测试连接函数
export const connectDatabase = async () => {
    await testConnection();
};
export default pool;
//# sourceMappingURL=database.js.map