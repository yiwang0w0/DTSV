const MapItem = require('../models/MapItem');

async function dropMapItem(pls, name, kind, effect, uses, skill, session) {
  if (!name) return;
  const data = {
    itm: name,
    itmk: kind,
    itme: effect,
    itms: String(uses),
    itmsk: skill,
    pls
  };
  if (session) {
    await MapItem.create([data], { session });
  } else {
    await MapItem.create(data);
  }
}

async function restoreMemoryItem(player) {
  if (!player.searchmemory) return;
  try {
    const item = JSON.parse(player.searchmemory);
    const data = {
      itm: item.itm,
      itmk: item.itmk,
      itme: item.itme,
      itms: String(item.itms),
      itmsk: item.itmsk,
      pls: item.pls
    };
    await MapItem.create(data);
  } catch (e) {
    console.error(e);
  }
  player.searchmemory = '';
}

module.exports = {
  dropMapItem,
  restoreMemoryItem
};
