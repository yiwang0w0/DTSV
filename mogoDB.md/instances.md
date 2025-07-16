# 副本数据导入

当 `gametype` 取值 15~19 时，对应副本将从 `data/instances/<instance>/` 中读取初始地图物品、陷阱和 NPC 数据。可按需手动导入：

```bash
mongoimport --db dts --collection mapitems --file ../data/instances/<instance>/mapitem.json --jsonArray
mongoimport --db dts --collection maptraps --file ../data/instances/<instance>/trapitem.json --jsonArray
mongoimport --db dts --collection players --file ../data/instances/<instance>/npc.data.json --jsonArray
```

上述文件由 `scripts/generateInstanceData.php` 自动生成。
