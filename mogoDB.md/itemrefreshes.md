# itemrefreshes 集合示例

用于配置不同阶段刷新的地图物品列表，对应模型 `backend/src/models/ItemRefresh.js`：

```javascript
use dts;
db.itemrefreshes.insertMany([
  { stage: 'start', itm: '矿泉水', itmk: 'HS', itme: 100, itms: '30', itmsk: '', pls: 1 },
  { stage: 'ban2', itm: '手机', itmk: 'EE', itme: 1, itms: '1', itmsk: '', pls: 2 }
]);
```

在 MongoDB shell 中可以为 `stage` 字段建立索引：

```javascript
db.itemrefreshes.createIndex({ stage: 1 });
```

也可以分别从 `data/mapitems.json`、`data/mapitems_ban2.json`、`data/mapitems_ban4.json` 导入：

```bash
mongoimport --db dts --collection itemrefreshes --file ../data/mapitems.json --jsonArray
mongoimport --db dts --collection itemrefreshes --file ../data/mapitems_ban2.json --jsonArray
mongoimport --db dts --collection itemrefreshes --file ../data/mapitems_ban4.json --jsonArray
```
