# Dockerfile

# 1. 选择一个官方的Node.js镜像作为基础
FROM node:18-alpine

# 2. 在容器内创建一个工作目录
WORKDIR /app

# 3. 复制 package.json 和 yarn.lock 文件
COPY package.json yarn.lock ./

# 4. 安装所有依赖 (包括 devDependencies 以便进行构建)
RUN yarn install

# 5. 将项目的所有文件复制到工作目录
COPY . .

# 6. --- 新增：构建 TypeScript 项目 ---
# 这一步会执行 tsc 命令，并创建 /app/dist 目录
RUN yarn build

# 7. (可选优化) 移除 devDependencies 以减小最终镜像的大小
RUN yarn install --production

# 8. 给予入口脚本可执行权限
RUN chmod +x /app/scripts/entrypoint.sh

# 9. 全局安装 PM2
RUN yarn global add pm2

# 10. 指定容器的入口点
ENTRYPOINT ["/app/scripts/entrypoint.sh"]

# 11. 暴露应用监听的端口
EXPOSE 3000

# 12. 定义默认命令
CMD ["pm2-runtime", "start", "ecosystem.config.cjs", "--env", "production"]
