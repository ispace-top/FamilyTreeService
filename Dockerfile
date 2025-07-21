# Dockerfile

# 1. 选择一个官方的Node.js镜像作为基础
FROM node:18-alpine

# 2. 在容器内创建一个工作目录
WORKDIR /app

# 3. 复制 package.json 和 yarn.lock 文件
COPY package.json yarn.lock ./

# 4. 安装项目依赖
RUN yarn install --production

# 5. 将项目的所有文件复制到工作目录
COPY . .

# 6. 新增：给予入口脚本可执行权限
RUN chmod +x /app/entrypoint.sh

# 7. 全局安装 PM2
RUN yarn global add pm2

# 8. 新增：指定容器的入口点
ENTRYPOINT ["/app/entrypoint.sh"]

# 9. 暴露应用监听的端口 (容器内部的端口)
EXPOSE 3000

# 10. 定义传递给入口脚本的默认命令
CMD ["pm2-runtime", "start", "ecosystem.config.js", "--env", "production"]
