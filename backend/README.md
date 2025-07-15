# 后端说明

后端基于 **Express**，数据存储使用 **MongoDB**，缓存及排行榜使用 **Redis**。

主要目录：

```txt
src/
  controllers/   # 负责解析请求并返回结果
  services/      # 拆分后的业务逻辑模塊
  models/        # Mongoose 模型
  routes/        # 路由入口
  middlewares/   # 权限校验等中间件
  config/        # 常量与连接配置
  utils/         # 通用工具函数
  app.js         # 程序入口
```

各功能 API 在 `routes` 中定义，控制器调用 `services` 中的函数，保持与原版数据结构一致。

启动步骤：

```bash
cd backend
npm install
npm run dev
```

