# craftrecipes 集合

记录物品合成配方。需要创建 `craftrecipes` 集合并初始化默认记录。

```javascript
use dts;
db.craftrecipes.insertMany([
  {
    materials: ['面包', '矿泉水'],
    materialHash: '面包|矿泉水',
    result: { name: '简易便当', kind: 'HB', effect: 150, dur: '1', skill: '' }
  },
  {
    materials: ['小刀', '磨刀石'],
    materialHash: '小刀|磨刀石',
    result: { name: '锋利的小刀', kind: 'WK', effect: 50, dur: '30', skill: '' }
  },
  {
    materials: ['木棍', '铁钉', '胶带'],
    materialHash: '木棍|铁钉|胶带',
    result: { name: '钉棍', kind: 'WP', effect: 45, dur: '25', skill: '' }
  }
]);
```

为 `materialHash` 字段建立唯一索引：

```javascript
db.craftrecipes.createIndex({ materialHash: 1 }, { unique: true });
```

结构对应 `backend/src/models/CraftRecipe.js`。
