# mapitems 集合示例

配置文件 `DTS-SAMPLE/include/modules/base/itemmain/config/mapitem.config.php` 中给出了地图道具的原始数据。下面根据该配置转换成 `insertMany` 示例：

```javascript
use dts;
db.mapitems.insertMany([
  { iid: 1, time: 0, itm: '煤气罐', itmk: 'GBi', itme: 1, itms: '10', itmsk: '', pls: 0 },
  { iid: 2, time: 0, itm: '增幅设备', itmk: 'X', itme: 1, itms: '1', itmsk: '', pls: 1 }
]);
```

项目根目录 `data` 目录提供了 `mapitems.json`，可直接导入：

```bash
mongoimport --db dts --collection mapitems --file ../data/mapitems.json --jsonArray
```

`mapitems.json` 内已根据原版配置生成了全部地图的初始物品池，可在后台管理界面实时增删改查。

以上字段对齐 `backend/src/models/MapItem.js`，仅为示例可按需调整。新增 `time` 字段用于标记道具刷新的禁区序号，0 表示开局，99 表示每次增加禁区都会刷新。
