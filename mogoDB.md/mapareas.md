# mapareas 集合示例

原作在 `map.config.php` 或 `mapname.config.php` 中定义的地图区域，现在独立存入 `mapareas` 集合。以下是基本插入示例：

```javascript
use dts;
db.mapareas.insertMany([
  { pid: 0, name: "墓地", danger: 0 },
  { pid: 1, name: "教学楼", danger: 0 },
  { pid: 2, name: "体育馆", danger: 0 }
]);
```

字段请参考 `backend/src/models` 中的相关定义，可按需补充更多区域。

创建集合后请为 `pid` 字段建立唯一索引：

```javascript
db.mapareas.createIndex({ pid: 1 }, { unique: true })
```
