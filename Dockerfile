# Dockerfile

# 1. 选择一个官方的Node.js镜像作为基础
# 我们选择一个长期支持版(LTS)
FROM node:18-alpine

# 2. 在容器内创建一个工作目录
WORKDIR /app

# 3. 复制 package.json 和 yarn.lock (或 package-lock.json) 文件
# 这样做可以利用Docker的缓存机制，只有在依赖变化时才重新安装
COPY package.json yarn.lock ./

# 4. 安装项目依赖
RUN yarn install --production

# 5. 将项目的所有文件复制到工作目录
COPY . .

# 6. 全局安装 PM2
RUN yarn global add pm2

# 7. 暴露应用监听的端口 (容器内部的端口)
EXPOSE 3000

# 8. 定义容器启动时要执行的命令
# 使用 PM2 来启动我们的应用，并确保它在前台运行以便Docker管理
CMD ["pm2-runtime", "start", "ecosystem.config.js", "--env", "production"]
