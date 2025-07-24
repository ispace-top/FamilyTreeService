// ecosystem.config.js
// 这是PM2的配置文件，用于定义如何启动和管理我们的应用

module.exports = {
  apps: [
    {
      name: 'FamilyTreeServer', // 应用名称
      script: 'dist/index.js',         // 启动文件 (TypeScript构建输出)
      watch: '.',               // 监视文件变化，可选
      ignore_watch: ["node_modules"], // 忽略监视的文件夹
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      }
    }
  ]
};
