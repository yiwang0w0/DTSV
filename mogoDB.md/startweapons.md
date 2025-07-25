# startweapons 集合示例

用于配置玩家开局随机获得的武器列表，字段与 `backend/src/models/StartWeapon.js` 对应：

```javascript
use dts;
db.startweapons.insertMany([
  { name: '菜刀', kind: 'WK', effect: 15, dur: '10', skill: '' },
  { name: '叉子', kind: 'WK', effect: 10, dur: '10', skill: '' }
]);
```

初始化示例：
```bash
mongoimport --db dts --collection startweapons --file ../data/start_weapons.json --jsonArray
```
