#!/bin/sh

# Shell脚本会在执行命令出错时立即退出
set -e

# 1. 运行数据库初始化脚本
echo "Running database initialization..."
node scripts/init-db.js

# 2. 执行Dockerfile中CMD指令定义的命令 (即启动主应用)
echo "Starting the application..."
exec "$@"
