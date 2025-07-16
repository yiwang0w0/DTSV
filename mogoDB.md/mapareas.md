# mapareas 集合示例

原作在 `map.config.php` 中定义了全部 35 个地图区域，这些数据现在独立存入 `mapareas` 集合。以下是基本插入示例：

```javascript
use dts;
db.mapareas.insertMany([
  { pid: 0, name: "墓地", danger: 0, xy: "A-1", info: "..." },
  { pid: 1, name: "教学楼", danger: 0, xy: "B-1", info: "..." },
  { pid: 2, name: "体育馆", danger: 0, xy: "C-1", info: "..." }
]);
```

字段请参考 `backend/src/models` 中的相关定义，可按需补充更多区域。

创建集合后请为 `pid` 字段建立唯一索引：

```javascript
db.mapareas.createIndex({ pid: 1 }, { unique: true })
```

若已存在旧版本的 `mapareas` 集合，需要为所有文档补充 `xy` 与 `info` 字段：

```javascript
db.mapareas.updateMany({}, { $set: { xy: '', info: '' } })
```

也可以直接导入项目根目录 `data/mapareas.json` 提供的完整地图数据：

```bash
mongoimport --db dts --collection mapareas --file ../data/mapareas.json --jsonArray
```
