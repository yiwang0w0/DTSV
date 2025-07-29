const constants = require('../../config/constants');

function calcCriticalChance(attacker, defender) {
  let rate = constants.get('CRIT_BASE_RATE') || 0.05;
  if (attacker.wepsk && attacker.wepsk.includes('c')) {
    rate += 0.1;
  }
  // TODO: 根据装备、技能或职业调整暴击率
  return rate;
}

function calcDodgeChance(attacker, defender) {
  let rate = constants.get('DODGE_BASE_RATE') || 0.05;
  if (defender.arfsk && defender.arfsk.includes('D')) {
    rate += 0.1;
  }
  // TODO: 根据装备、技能或职业调整闪避率
  return rate;
}

function checkCritical(attacker, defender) {
  return Math.random() < calcCriticalChance(attacker, defender);
}

function checkDodge(attacker, defender) {
  return Math.random() < calcDodgeChance(attacker, defender);
}

module.exports = {
  calcCriticalChance,
  calcDodgeChance,
  checkCritical,
  checkDodge,
};
