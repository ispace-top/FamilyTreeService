// ecosystem.config.cjs
// 这是PM2的配置文件，用于定义如何启动和管理我们的应用
// 使用 .cjs 后缀以确保它被当作 CommonJS 模块处理

module.exports = {
  apps: [
    {
      name: 'FamilyTreeServer',       // 应用名称
      script: 'dist/index.js',         // 启动文件 (TypeScript构建输出)
      watch: true,                     // 启用监视模式
      
      // --- 关键修改：忽略对以下目录的监视 ---
      ignore_watch: [
        "node_modules",
        "logs",
        "uploads",
        ".git"
      ],
      
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      }
    }
  ]
};
