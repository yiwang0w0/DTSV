# mapitems 集合示例

配置文件 `DTS-SAMPLE/include/modules/base/itemmain/config/mapitem.config.php` 中给出了地图道具的原始数据。下面根据该配置转换成 `insertMany` 示例：

```javascript
use dts;
db.mapitems.insertMany([
  { iid: 1, stage: 'start', itm: '煤气罐', itmk: 'GBi', itme: 1, itms: '10', itmsk: '', pls: 0 },
  { iid: 2, stage: 'ban2', itm: '增幅设备', itmk: 'X', itme: 1, itms: '1', itmsk: '', pls: 1 }
]);
```

项目根目录 `data` 目录提供了 `mapitems.json`，可直接导入：

```bash
mongoimport --db dts --collection mapitems --file ../data/mapitems.json --jsonArray
```

`mapitems.json` 内记录了带有 `stage` 字段的物品列表，对应开局或禁区阶段刷新的道具，可在后台管理界面实时增删改查。

以上字段对齐 `backend/src/models/MapItem.js`，仅为示例可按需调整。

在 MongoDB shell 中可以为位置和阶段建立复合索引：

```javascript
db.mapitems.createIndex({ pls: 1, stage: 1 });
```
