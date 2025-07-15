const MapItem = require('../models/MapItem');

async function dropMapItem(pls, name, kind, effect, uses, skill, session) {
  if (!name) return;
  const data = { itm: name, itmk: kind, itme: effect, itms: uses, itmsk: skill, pls };
  if (session) {
    await MapItem.create([data], { session });
  } else {
    await MapItem.create(data);
  }
}

module.exports = {
  dropMapItem
};
