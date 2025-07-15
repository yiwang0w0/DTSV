# 前端说明

前端基于 **Vue3 + Element Plus** 开发，主要文件结构如下：

```txt
src/
  api/          # 按功能拆分的接口调用封装
  components/   # 可复用的界面组件
  pages/        # 页面入口
  router/       # 路由定义
  store/        # Pinia 状态管理
  main.js       # 应用入口
```

API 调用统一在 `src/api` 目录下定义，例如 `game.js` 中封装了所有游戏相关的请求：

```js
import { move, search } from '@/api/game'
```

页面使用组件化方式呈现游戏界面，比如 `Map.vue` 组合了 `PlayerStats`、`EquipmentList`、`LogPanel` 等模块，方便维护与复用。

环境变量 `VITE_API_BASE_URL` 控制后端请求地址，开发时在 `.env` 中配置。启动方式：

```bash
npm install
npm run dev
```

