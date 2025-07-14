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
