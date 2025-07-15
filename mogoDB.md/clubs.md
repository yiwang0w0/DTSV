# Clubs 集合初始化
1. 进入 MongoDB shell：`mongo`
2. 切换数据库：`use dts`
3. 创建 `clubs` 集合并建立索引：
   ```javascript
   db.clubs.createIndex({ cid: 1 })
   ```
4. 如果已存在旧数据，可执行以下命令导入完整职业列表：
   ```javascript
   db.clubs.deleteMany({})
   db.clubs.insertMany(JSON.parse(cat('data/clubs.json')))
   ```
5. 从 `v1.1` 起，后端在启动时会自动检查 `clubs` 集合，若为空则读取
   `data/clubs.json` 写入默认职业列表，可在日志中看到提示。
