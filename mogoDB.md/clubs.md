# Clubs 集合初始化
1. 进入 MongoDB shell：`mongo`
2. 切换数据库：`use dts`
3. 创建 `clubs` 集合并建立索引：
   ```javascript
   db.clubs.createIndex({ cid: 1 })
   ```
4. 如果已存在旧数据，可执行以下命令导入默认职业列表：
   ```javascript
   db.clubs.deleteMany({})
   db.clubs.insertMany(JSON.parse(cat('data/clubs.json')))
   ```
