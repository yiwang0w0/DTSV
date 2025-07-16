# NPC 数据导入

原版 `npc.data.config.php` 中定义了各类 NPC。本项目将其转换为 `data/npcs.json`，
格式与 `backend/src/models/Player.js` 一致。可通过以下命令导入：

```bash
mongoimport --db dts --collection players --file ../data/npcs.json --jsonArray
```

该操作会把 `type>0` 的玩家数据替换为默认 NPC 列表，游戏开始时也会自动从该文件
写入 NPC。
