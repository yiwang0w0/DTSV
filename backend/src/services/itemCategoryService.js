const ItemCategory = require('../models/ItemCategory');
const Item = require('../models/Item');
const fs = require('fs');
const path = require('path');

async function importFromMapItems() {
  const file = path.join(__dirname, '../../../data/mapitems.json');
  if (!fs.existsSync(file)) throw new Error('mapitems.json not found');
  const raw = JSON.parse(fs.readFileSync(file));
  const items = await Item.find({}, 'id name');
  const nameMap = {};
  items.forEach((it) => {
    if (nameMap[it.name] === undefined) nameMap[it.name] = it.id;
  });
  const catMap = {};
  for (const m of raw) {
    const stage = m.stage || 'start';
    if (!catMap[stage]) catMap[stage] = { name: `默认${stage}`, type: 'mapitem', items: [] };
    const itemId = nameMap[m.itm];
    if (!itemId) continue;
    catMap[stage].items.push({
      itemId,
      pls: m.pls || 0,
      count: 1,
      itmk: m.itmk,
      itme: m.itme,
      itms: m.itms,
      itmsk: m.itmsk,
      stage,
    });
  }
  const list = Object.values(catMap);
  if (!list.length) return 0;
  await ItemCategory.deleteMany({});
  await ItemCategory.insertMany(list);
  return list.length;
}

module.exports = { importFromMapItems };
