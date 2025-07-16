# maptraps 集合示例

`trapitem.config.php` 中定义了各类陷阱。以下示例将其中两行转换为插入语句：

```javascript
use dts;
db.maptraps.insertMany([
  { tid: 1, itm: '【最终机枪防线】', itmk: 'TO', itme: 400, itms: '1', itmsk: '1', pls: 0 },
  { tid: 2, itm: '脉冲防线', itmk: 'TO', itme: 200, itms: '1', itmsk: '', pls: 1 }
]);
```

字段与 `backend/src/models/MapTrap.js` 匹配。
