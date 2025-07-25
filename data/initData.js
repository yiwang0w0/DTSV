// 初始化 DTS 数据库
const dbName = 'dts';
const dbconn = connect('127.0.0.1/' + dbName);

// 导入 gameinfo
var gameinfo = JSON.parse(cat('./gameinfo.json')); // 数组形式
if (gameinfo.length) {
  db.gameinfos.remove({});
  db.gameinfos.insertMany(gameinfo);
}

// 导入 shopitems
var shopitems = JSON.parse(cat('./shopitems.json'));
if (shopitems.length) {
  db.shopitems.remove({});
  db.shopitems.insertMany(shopitems);
}

// 导入 items
var items = JSON.parse(cat('./items.json'));
if (items.length) {
  db.items.remove({});
  db.items.insertMany(items);
}


// 导入 mapareas
var mapareas = JSON.parse(cat('./mapareas.json'));
if (mapareas.length) {
  db.mapareas.remove({});
  db.mapareas.insertMany(mapareas);
}

// 导入 maptraps
var maptraps = JSON.parse(cat('./maptraps.json'));
if (maptraps.length) {
  db.maptraps.remove({});
  db.maptraps.insertMany(maptraps);
}

// 导入 mapitems
var mapitems = JSON.parse(cat('./mapitems.json'));
if (mapitems.length) {
  db.mapitems.remove({});
  db.mapitems.insertMany(mapitems);
}

// 导入 itemrefreshes
var startItems = JSON.parse(cat('./mapitems.json'));
var ban2Items = JSON.parse(cat('./mapitems_ban2.json'));
var ban4Items = JSON.parse(cat('./mapitems_ban4.json'));
var itemrefreshes = startItems.concat(ban2Items, ban4Items);
if (itemrefreshes.length) {
  db.itemrefreshes.remove({});
  db.itemrefreshes.insertMany(itemrefreshes);
}

// 导入 clubs
var clubs = JSON.parse(cat('./clubs.json'));
if (clubs.length) {
  db.clubs.remove({});
  db.clubs.insertMany(clubs);
}

// 导入 constants
var constants = JSON.parse(cat('./constants.json'));
if (constants.length) {
  db.constants.remove({});
  db.constants.insertMany(constants);
}

print('数据导入完成');
