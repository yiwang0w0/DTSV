# NPC 数据导入

原版 `npc.data.config.php` 中定义的 NPC 已统一存储在 `npcs` 集合中，
字段与 `backend/src/models/Player.js` 完全一致。可通过以下命令导入默认列表：

```bash
use dts
db.npcs.deleteMany({})
mongoimport --db dts --collection npcs --file ../data/npcs.json --jsonArray
```

上述命令会清空旧的 NPC 数据后重新写入默认列表。系统启动时将直接从数据库读取 `npcs` 集合，不再依赖 `data/npcs.json`。

前端提供 **NPC目录** 管理页，可在 `/admin/npcdir` 维护该集合，创建后即可在刷新表中通过 NPC 名称引用。若无需备份，可将 `data/npcs.json` 清空，避免与数据库重复导入。

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
