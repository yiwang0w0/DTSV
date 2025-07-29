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

其中数据是根据 `data/npcs.json` 中带有 `spawnStage` 字段的 NPC 生成，包含
`start`、`ban2`、`ban4` 三个阶段。如需重新制作，可在 Node.js 环境执行：

```javascript
const fs = require('fs');
const npcs = JSON.parse(fs.readFileSync('data/npcs.json'));
const spawns = npcs.filter(n => n.spawnStage).map(n => ({
  area: n.pls,
  npc: n.name,
  type: n.type,
  sub: n.sub || 0,
  num: 1,
  stage: n.spawnStage,
}));
fs.writeFileSync('data/npcspawns.json', JSON.stringify(spawns, null, 2));
```

若手动编辑，请确保 `npc` 字段与 `npcs` 集合中的名称一致，系统会据此自动填充
`type` 与 `sub`。
