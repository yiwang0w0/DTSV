# NPC 数据导入

原版 `npc.data.config.php` 中定义了各类 NPC。本项目已将其转换为 `data/npcs.json`，
格式与 `backend/src/models/Player.js` 一致。可通过以下命令手动导入：

```bash
use dts
db.players.deleteMany({ type: { $gt: 0 } })
mongoimport --db dts --collection players --file ../data/npcs.json --jsonArray
```

上述命令会清空旧的 NPC 数据后重新写入默认列表。系统在启动新游戏时同样会自
动执行清理并从 `data/npcs.json` 导入 NPC，一般无需手动操作。
