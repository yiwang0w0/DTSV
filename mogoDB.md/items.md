# items 集合示例

`items` 用于存放角色生成时可能出现的全部基础物品，包括初始武器。

```javascript
use dts;
db.items.insertMany([
  { name: '面包', kind: 'HH', effect: 100, dur: '30', skill: '' },
  { name: '菜刀', kind: 'WK', effect: 15, dur: '10', skill: '' }
]);
```

创建集合后建议为 `name` 字段建立索引：

```javascript
db.items.createIndex({ name: 1 });
```

项目 `data/items.json` 已汇总了全部物品，可使用如下命令批量导入：

```bash
mongoimport --db dts --collection items --file ../data/items.json --jsonArray
```
