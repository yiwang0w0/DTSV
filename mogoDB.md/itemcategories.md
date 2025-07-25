# itemcategories 集合初始化

该集合用于自定义地图道具或陷阱的生成类别。每个文档格式如下：

```javascript
{
  name: '默认地图掉落',
  type: 'mapitem', // 或 'maptrap'
  // stage 表示刷新的阶段，可选值：'start', 'ban2', 'ban4'
  items: [
    { itemId: 1, pls: 1, count: 2, stage: 'start' },
    { itemId: 2, pls: 2, count: 3, stage: 'ban2' }
  ]
}
```

在 MongoDB shell 中创建集合并建立索引：

```javascript
use dts;
db.itemcategories.createIndex({ name: 1 });
```

可通过批量导入 `data/itemCategories.json`：

```bash
mongoimport --db dts --collection itemcategories --file ../data/itemCategories.json --jsonArray
```
