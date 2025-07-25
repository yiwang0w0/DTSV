
# DTS-SAMPLE 重构版（MongoDB+Redis 后端 + Vue3 前端）

## 项目简介

本项目基于 [DTS-SAMPLE](https://github.com/yiwang0w0/dts) 原版 PHP 游戏，**严格对齐原作机制、玩法与功能**，重构为**Node.js 后端（MongoDB + Redis）与 Vue3 + Element Plus 前端**，实现前后端分离。  
后端负责业务逻辑和数据存储，前端提供现代化交互体验。  
**注意：严禁自创机制，仅原汁原味还原原作。**

---

## 技术栈

- **前端**：Vue3 + Element Plus + Axios + Vite
- **后端**：Node.js（Express/Koa）+ Mongoose (MongoDB ORM) + Redis
- **数据库**：MongoDB（持久存储）+ Redis（缓存、排行榜、实时数据等）
- **消息通信**：WebSocket (实时消息/房间同步)
- **环境依赖**：Node.js ≥ 18.x, MongoDB ≥ 6.x, Redis ≥ 6.x

项目代码已经按“控制器 / 服务”方式拆分，后端业务逻辑位于 `src/services`，
前端页面也拆解成多个可复用组件与独立的 API 模块，便于通过接口按需调
用各项功能。

---

## 目录结构

```txt
/
├── backend/               # 后端服务代码
│   ├── src/
│   │   ├── controllers/   # 路由层
│   │   ├── services/      # 业务逻辑拆分模块
│   │   ├── models/        # Mongoose 模型
│   │   ├── routes/        # API 接口定义
│   │   ├── middlewares/   # 中间件
│   │   ├── utils/         # 工具方法
│   │   ├── config/        # 配置文件（含 constants.js）
│   │   └── app.js         # 入口文件
│   └── README.md
├── frontend/              # 前端源码
│   ├── src/
│   │   ├── api/           # 与后端接口交互
│   │   ├── components/    # 组件
│   │   ├── pages/         # 页面
│   │   ├── router/        # 路由
│   │   ├── store/         # 状态管理(pinia)
│   │   ├── utils/
│   │   └── main.js
│   └── README.md
├── data/                  # 初始数据与脚本
├── mogoDB.md/             # MongoDB 操作说明目录
├── scripts/               # 原作数据转换脚本
├── .env                   # 环境变量（示例见.env.example）
└── README.md              # 本文件
```

---

## 安装部署

### 1. 克隆项目

```bash
git clone https://github.com/yourname/dts-sample-mongo-vue.git
cd dts-sample-mongo-vue
```

### 2. 后端环境搭建

- **安装依赖**

  ```bash
  cd backend
  npm install
  ```

- **配置环境变量**
  - 复制 `.env.example` 为 `.env` 并根据实际填写
    ```
    MONGODB_URI=mongodb://localhost:27017/dts
    REDIS_URL=redis://localhost:6379
    JWT_SECRET=your_secret
    JWT_REFRESH_SECRET=your_refresh_secret
    JWT_ACCESS_EXPIRES=1h
    JWT_REFRESH_EXPIRES=7d
    ```

- **启动 MongoDB、Redis 服务**
  - 推荐用 Docker:
    ```bash
    docker run -d --name mongodb -p 27017:27017 mongo
    docker run -d --name redis -p 6379:6379 redis
    ```

- **启动后端服务**
  ```bash
  npm run dev
  # 默认监听 3000 端口
  ```
  或者 node src/app.js


### 3. 前端环境搭建

- **安装依赖**

  ```bash
  cd frontend
  npm install
  ```

- **配置环境变量**

  复制 `.env.example` 为 `.env`，配置后端 API 地址：
  ```
  VITE_API_BASE_URL=http://localhost:3000/api
  ```

- **启动前端服务**
  ```bash
npm run dev
# 默认监听 5173 端口
```

### 4. 数据初始化

项目根目录 `data` 目录内提供了原作同款的 `gameinfo.json`、`shopitems.json` 与 `items.json` 数据文件，其中 `items.json` 已包含 `id` 字段，可直接导入 MongoDB：

```bash
cd mogoDB.md  # 进入存放数据库脚本的目录
mongoimport --db dts --collection gameinfos --file ../data/gameinfo.json --jsonArray
mongoimport --db dts --collection shopitems --file ../data/shopitems.json --jsonArray
mongoimport --db dts --collection items --file ../data/items.json --jsonArray
mongoimport --db dts --collection mapareas --file ../data/mapareas.json --jsonArray
mongoimport --db dts --collection mapitems --file ../data/mapitems.json --jsonArray
mongoimport --db dts --collection itemcategories --file ../data/itemCategories.json --jsonArray
```
其中 `itemCategories.json` 示范了物品生成类别配置，导入后可在后台管理界面调整各类别内容。

也可以在 `mongo` shell 中执行 `data/initData.js` 脚本一次完成导入：

```bash
mongo ../data/initData.js
```

导入完成后即可获得与原作一致的基础游戏信息、地图区域以及默认物品池。
如需手动添加地图或物品，可参照 `mogoDB.md/mapareas.md`、`mogoDB.md/mapitems.md` 和 `mogoDB.md/items.md` 的说明。
若需自定义物品生成类别，请参考 `mogoDB.md/itemcategories.md`。

---

## 主要功能及对齐说明

### 1. 用户与游戏身份分离

- **全局登录用户**：用于账号体系、成就、历史记录、排行榜。
- **单局游戏玩家对象**：每局独立的玩家数据，绑定本场游戏变量。
- **注意：两者数据、操作、生命周期严格分离，严禁混用。**

### 2. 地图与事件机制

- **地图机制**：仅支持“一键跳转”，无自由坐标、无上下左右移动。
- **地图区域字典**：区域数据从原作配置文件迁移至 `mapareas` 集合，初始示例见 `mogoDB.md/mapareas.md`。
- **地图事件**：“搜索”、“遇敌”等事件流程/判定，**严格还原原作流程**。

### 3. 物品/NPC分布与处理

- **物品与NPC分布**：按原作分池、分位置、严格还原，不得简化或合并。
- **物品/装备/NPC接口**：各类物品获取、使用、丢弃、NPC遭遇、战斗均还原原版数据结构与接口。

### 4. 排行榜与结算

- **排行榜、成就、历史记录**：接口、判定、数据表与原作对齐，兼容原有字段与结构。
- **结算方式**：胜利条件、奖励、历史记录等，全部严格还原。

### 5. 消息/私信/系统公告

- **消息机制**：接口格式、消息内容、推送方式，保持与原作兼容。
- **私信系统**：保持原有结构，支持扩展但不可更改原有数据字段。

### 6. API 规范与数据表

- **后端 API**：接口命名、请求/响应结构严格与原版兼容，优先复用原有字段。
- **数据库结构**：MongoDB collections 字段、嵌套结构尽量对齐原作 SQL 字段定义，便于兼容和数据迁移。

---

## 迁移与开发注意事项

1. **严格按 DTS-SAMPLE 机制、数据流程开发**，不得创新机制/简化玩法。
2. **每个功能开发前，务必参考原项目代码/说明，做到结构、判定、数据字段一一对齐。**
3. **涉及“地图”、“物品”、“NPC”等核心机制时，先对照原 PHP 源码与数据表，后实现。**
4. **有疑问请查阅 [DTS-SAMPLE](https://github.com/yiwang0w0/dts) 及[原作代码](https://github.com/sillycross/dts)。**

---

## 常用命令

### 后端

```bash
npm run dev      # 开发环境启动
npm run start    # 生产环境启动
npm run lint     # 代码规范检查
```

### 前端

```bash
npm run dev      # 开发环境启动
npm run build    # 打包生产环境
npm run lint     # 代码规范检查
```

## 游戏控制 API

- **GET `/api/game/info`**：返回当前游戏状态及统计信息，示例：

  ```json
  {
    "version": "1.0.1",
    "gamestate": "active",
    "starttime": 0,
    "areaInterval": 0,
    "areaAdd": 0,
    "areanum": 0,
    "alivenum": 0,
    "deathnum": 0
  }
  ```

- **GET `/api/game/mapareas`**：返回地图区域名称数组，用于客户端显示：

  ```json
  ["墓地","教学楼","体育馆"]
  ```

- **POST `/api/game/start`**：将 `gamestate` 设为 `active`，成功返回：

  ```json
  { "msg": "游戏已开始", "gamestate": "active" }
  ```

- **POST `/api/game/stop`**：强制结束当前游戏并归档历史，对应返回：

  ```json
  { "msg": "游戏已停止", "gamestate": "inactive" }
  ```

### 手动游戏控制按钮

首页游戏信息区域提供“手动开始游戏”和“手动关闭游戏”两个按钮，
分别调用上述 `/api/game/start` 与 `/api/game/stop` 接口，操作成功后自动刷新状态，可用于调试或管理员手动控制游戏进度。

## 玩家操作 API

- **POST `/api/game/enter`**：进入游戏，参数 `club` 可选，返回 `pid` 与初始位置。
- **POST `/api/game/move`**：移动至指定区域，需传 `pid`、`pls`。
- **POST `/api/game/search`**：在当前位置搜索物品或触发事件。
- **GET `/api/game/status`**：查询指定玩家状态，参数 `pid`。
- **GET `/api/game/players`**：当前局存活玩家列表。
- **POST `/api/game/rest`**：原地休息恢复体力，参数 `pid`。
- **POST `/api/game/pick`**：拾取发现的物品，需 `pid` 与 `itemId`。
- **POST `/api/game/pickreplace`**：以背包指定格子替换拾取的物品，需 `index`。
- **POST `/api/game/pickequip`**：直接装备发现的物品。
- **POST `/api/game/use`**：使用背包物品，需 `index`。
- **POST `/api/game/equip`**：装备背包物品。
- **POST `/api/game/unequip`**：卸下装备栏物品，参数 `slot`。

## 认证 API

- **POST `/api/auth/login`**：登录并返回 `token` 与 `refreshToken`
- **POST `/api/auth/register`**：注册并返回 `token` 与 `refreshToken`
- **POST `/api/auth/refresh`**：使用 `refreshToken` 获取新的 `token`
- **POST `/api/auth/logout`**：注销并清除服务器端的 `refreshToken`

客户端在收到 `令牌过期` 响应时会自动调用 `/api/auth/refresh`，
刷新成功后重试原请求，无需手动重新登录。

## 管理 API

管理员登录后可通过以下接口管理数据：
- **GET `/api/admin/:collection`**：分页获取集合文档。
- **POST `/api/admin/:collection`**：在指定集合创建文档。
- **PUT `/api/admin/:collection/:id`**：更新指定文档。
- **DELETE `/api/admin/:collection/:id`**：删除指定文档。
- **GET `/api/admin/maps`**：查看各地图区域的在线玩家。

---

## 参考/致谢

- [DTS-SAMPLE 原作](https://github.com/yiwang0w0/dts)
- [DTS（sillycross原版）](https://github.com/sillycross/dts)
- [Vue3 官方文档](https://cn.vuejs.org/)
- [Element Plus](https://element-plus.org/)
- [MongoDB 官方](https://www.mongodb.com/)
- [Redis 官方](https://redis.io/)

---

## 贡献/开发规范

- 代码提交前请自测主要流程
- 所有变更必须确保**不偏离原作机制、数据表字段**
- PR 提交需详细说明变更点及其与原作的对齐情况
- 项目使用 [Prettier](https://prettier.io/) 格式化 JavaScript 代码，配置见根目录 `.prettierrc`


---

如有疑问，欢迎 issue 或联系维护者。

---

**提示：所有开发、设计、功能必须以 DTS-SAMPLE 原作为准，严格还原，不得自创。**
