# startitems 集合示例

用于配置玩家开局随机获得的非武器道具列表，字段与 `backend/src/models/StartItem.js` 对应：

```javascript
use dts;
db.startitems.insertMany([
  { name: '面包', kind: 'HH', effect: 100, dur: '30', skill: '' },
  { name: '矿泉水', kind: 'HS', effect: 100, dur: '30', skill: '' }
]);
```

可通过导入 `data/start_items.json` 完成初始化：
```bash
mongoimport --db dts --collection startitems --file ../data/start_items.json --jsonArray
```
