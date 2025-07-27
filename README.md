# 家谱小程序后端服务

一个基于TypeScript和Express构建的家谱小程序后端服务，采用模块化架构设计，实现家族成员管理和亲属关系维护功能。

## 项目架构

本项目采用分层架构设计，遵循面向对象原则和关注点分离：

- **控制器(Controllers)**: 处理HTTP请求和响应
- **服务(Services)**: 实现业务逻辑
- **路由(Routes)**: 定义API端点
- **中间件(Middleware)**: 处理请求过滤和认证
- **配置(Config)**: 管理应用配置
- **类型(Types)**: 定义TypeScript类型和接口

## 技术栈

- TypeScript
- Express.js
- MySQL
- JWT认证
- RESTful API

## 快速开始

### 前提条件

- Node.js v14+ 和 npm
- MySQL 数据库

### 安装步骤

1. 克隆仓库
```bash
# 克隆代码仓库
```

2. 安装依赖
```bash
npm install
```

3. 配置环境变量

复制环境变量模板并修改为您的配置：
```bash
cp .env.example .env
```

编辑.env文件，设置数据库连接信息和JWT密钥：
```
# 数据库配置
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=您的密码
DB_NAME=family_tree

# JWT配置
JWT_SECRET=您的JWT密钥
JWT_REFRESH_SECRET=您的JWT刷新密钥
```

4. 初始化数据库

创建数据库并导入SQL脚本（如有）：
```sql
CREATE DATABASE family_tree;
USE family_tree;
-- 导入数据库结构脚本
```

5. 运行项目

开发模式（自动重启）：
```bash
npm run dev
```

构建生产版本：
```bash
npm run build
npm start
```

## 可用脚本

- `npm run build`: 编译TypeScript代码到dist目录
- `npm start`: 启动生产环境服务器
- `npm run dev`: 使用ts-node启动开发服务器，支持热重载
- `npm test`: 运行测试（尚未实现）

## 目录结构

```
src/
├── controllers/    # 控制器
├── services/       # 服务层
├── routes/         # 路由定义
├── middleware/     # 中间件
├── config/         # 配置文件
├── types/          # TypeScript类型定义
├── utils/          # 工具函数
└── index.ts        # 应用入口
```

## API端点

### 认证
- POST /api/auth/login - 用户登录
- POST /api/auth/register - 用户注册
- POST /api/auth/refresh-token - 刷新令牌
- GET /api/auth/me - 获取当前用户信息

### 家族管理
- POST /api/families - 创建家族
- GET /api/families/:id - 获取家族详情
- PUT /api/families/:id - 更新家族信息
- DELETE /api/families/:id - 删除家族

### 成员管理
- GET /api/families/:familyId/members - 获取家族成员
- POST /api/families/:familyId/members - 添加家族成员
- GET /api/members/:id - 获取成员详情
- PUT /api/members/:id - 更新成员信息
- DELETE /api/members/:id - 删除成员

## 许可证

[ISC](LICENSE)