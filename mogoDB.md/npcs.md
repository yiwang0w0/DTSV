# NPC 数据导入

原版 `npc.data.config.php` 中定义了各类 NPC。本项目已将其转换为 `data/npcs.json`，
格式与 `backend/src/models/Player.js` 一致。可通过以下命令手动导入：

```bash
use dts
db.npcs.deleteMany({})
mongoimport --db dts --collection npcs --file ../data/npcs.json --jsonArray
```

上述命令会清空旧的 NPC 数据后重新写入默认列表。系统在启动新游戏时同样会自动执行清理并从 `data/npcs.json` 导入 NPC，一般无需手动操作。

## 新增 spawnStage 字段

为区分 NPC 的生成时机，需要在 `npcs` 集合新增 `spawnStage` 字段，类型为 `String`，可取值 `start`、`ban2`、`ban4`。

```javascript
use dts;
db.npcs.updateMany(
    { spawnStage: { $exists: false } },
    { $set: { spawnStage: 'start' } }
)
```

该字段对应 `backend/src/models/Player.js` 中的 `spawnStage`。
