# npcspawns 集合说明

用于定义各个地图区域在不同阶段刷新的 NPC 条目。字段如下：

```javascript
{
  area: 1,          // 地图区域ID
  npc: '红暮',      // NPC 名称
  type: 4,          // NPC 类型，创建时自动填入
  sub: 0,           // 子类别，创建时自动填入
  num: 1,           // 刷新数量
  stage: 'start'    // 刷新阶段，可选 'start' | 'ban2' | 'ban4'
}
```

在 MongoDB shell 中初始化集合并建立索引：

```javascript
use dts;
db.npcspawns.createIndex({ area: 1 });
db.npcspawns.createIndex({ stage: 1 });
```

可直接导入仓库附带的 `data/npcspawns.json`：

```bash
mongoimport --db dts --collection npcspawns --file ../data/npcspawns.json --jsonArray
```

其中的内容已根据 `data/npcs.json` 中 `spawnStage` 为 `start` 的 NPC 汇总生成，
如需重新制作，可按上述方式整理后覆盖。若手动编辑，请确保 `npc` 字段与
`npcs` 集合中的名称一致，系统会据此自动填充 `type` 与 `sub`。
