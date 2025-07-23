import winston from 'winston';
import 'winston-daily-rotate-file';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// 确保日志目录存在
const __dirname = dirname(fileURLToPath(import.meta.url));
const logDir = join(__dirname, '../../logs');
if (!existsSync(logDir)) {
  mkdirSync(logDir, { recursive: true });
}

// 通用日志格式
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.json()
);

// 服务器日志配置 - 记录服务器运行状态和关键数据
const serverLogger = winston.createLogger({
  level: 'info',
  format: logFormat,
  defaultMeta: { type: 'server' },
  transports: [
    // 控制台输出
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    // 文件输出 - 每日轮转
    new winston.transports.DailyRotateFile({
      filename: join(logDir, 'server-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      level: 'info'
    }),
    // 错误日志单独输出
    new winston.transports.DailyRotateFile({
      filename: join(logDir, 'server-error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
      level: 'error'
    })
  ]
});

// 用户操作日志配置 - 记录用户的增删改查操作
const userActivityLogger = winston.createLogger({
  level: 'info',
  format: logFormat,
  defaultMeta: { type: 'user_activity' },
  transports: [
    // 控制台输出
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    // 文件输出 - 每日轮转
    new winston.transports.DailyRotateFile({
      filename: join(logDir, 'user-activity-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
      level: 'info'
    })
  ]
});

export {
  serverLogger,
  userActivityLogger
};