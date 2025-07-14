# players 集合 uid 字段

为绑定玩家与全局用户，需要在 `players` 集合加入 `uid` 字段，并为已有文档初始化：

```javascript
use dts;
db.players.updateMany(
  { uid: { $exists: false } },
  { $set: { uid: null } }
)
```

该字段对应 `backend/src/models/Player.js` 中的 `uid`，类型为 `ObjectId`，引用 `users` 集合。

## 新增 restStart 字段

为实现休息计时，需要在 `players` 集合新增 `restStart` 字段，类型为 `Number`，记录开始休息的时间戳（毫秒）。

```javascript
use dts;
db.players.updateMany(
  { restStart: { $exists: false } },
  { $set: { restStart: 0 } }
)
```

该字段对应 `backend/src/models/Player.js` 中的 `restStart`。 
