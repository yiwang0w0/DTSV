const Constant = require('../models/Constant');

const cache = {
  START_THRESHOLD: 20,
  AREA_INTERVAL: 1200,
  AREA_ADD: 2,
  WEATHER_ACTIVE_OBBS: [10,20,0,-5,-10,-20,-15,0,-7,-10,-10,-5,0,-5,-20,-5,0,20],
  MOVE_SP_COST: 15,
  SEARCH_SP_COST: 15,
  ATTACK_SP_COST: 20
};

async function loadConstants() {
  const list = await Constant.find({});
  list.forEach(c => {
    cache[c.key] = c.value;
  });
}

function get(key) {
  return cache[key];
}

module.exports = { loadConstants, get };
