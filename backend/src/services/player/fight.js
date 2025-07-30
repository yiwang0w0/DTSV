const Player = require('../../models/Player');
const GameInfo = require('../../models/GameInfo');
const Log = require('../../models/Log');
const constants = require('../../config/constants');
const { checkDangerAreas } = require('../gameService');
const clubPro = require('../../config/clubProficiency');
// 引入完整工具避免解构失败
const playerUtils = require('./utils');
const { applyRest, restoreMemoryItem, formatPlayer } = playerUtils;
const combat = require('./combat');

// 武器系别到熟练度字段的映射
const SKILL_FIELDS = {
  P: 'wp',
  K: 'wk',
  G: 'wg',
  J: 'wg',
  C: 'wc',
  B: 'wc',
  D: 'wd',
  F: 'wf',
  N: 'wp',
};

// 各系熟练度伤害系数
const SKILL_DMG = {
  P: 0.6,
  K: 0.65,
  G: 0.6,
  J: 0.7,
  C: 0.35,
  B: 0.5,
  D: 0.75,
  F: 0.3,
  N: 0.6,
};

// 各系伤害浮动参数
const DMG_FLUC = {
  P: 15,
  K: 40,
  G: 20,
  J: 10,
  C: 5,
  B: 10,
  D: 25,
  F: 10,
  N: 15,
};

function calcAtt(p) {
  return Number(p.att) + Number(p.wepe || 0) * 2;
}
function calcDef(p) {
  return (
    Number(p.def) +
    Number(p.arbe || 0) +
    Number(p.arhe || 0) +
    Number(p.arae || 0) +
    Number(p.arfe || 0) +
    Number(p.arte || 0)
  );
}

function consumeWeapon(attacker) {
  if (!attacker.wep) return;
  let uses = attacker.weps;
  if (uses !== '∞') {
    const num = parseInt(uses, 10) - 1;
    attacker.weps = String(num);
    if (num <= 0) {
      attacker.wep = attacker.wepk = attacker.wepsk = '';
      attacker.wepe = 0;
      attacker.weps = '0';
    }
  }
}

function poseMod(pose) {
  switch (Number(pose)) {
    case 2:
      return 0.9; //防御姿势
    case 4:
      return 1.2; //攻击姿势
    default:
      return 1;
  }
}

function tacticMod(tactic) {
  switch (Number(tactic)) {
    case 2:
      return 1.1; //主动进攻
    case 4:
      return 0.8; //谨慎防御
    default:
      return 1;
  }
}

function infMod(inf) {
  let m = 1;
  if (!inf) return m;
  if (inf.includes('h')) m *= 0.9;
  if (inf.includes('b') || inf.includes('f')) m *= 0.95;
  return m;
}

function getWeaponKind(wepk) {
  if (!wepk || wepk.length < 2) return 'N';
  return wepk[1];
}

function getSkill(attacker) {
  const kind = getWeaponKind(attacker.wepk);
  const field = SKILL_FIELDS[kind];
  let val = field ? Number(attacker[field] || 0) : 0;
  if (field && attacker.club === 18) {
    const others = ['wp', 'wk', 'wg', 'wc', 'wd', 'wf'].filter(
      (f) => f !== field,
    );
    let sum = 0;
    for (const f of others) {
      sum += Number(attacker[f] || 0);
    }
    const conf = clubPro[18];
    if (conf && conf.crossBonus) {
      val += Math.floor(sum * conf.crossBonus);
    }
  }
  return val;
}

function gainSkill(attacker, amount = 1) {
  const kind = getWeaponKind(attacker.wepk);
  const field = SKILL_FIELDS[kind];
  if (field) {
    attacker[field] = Number(attacker[field] || 0) + amount;
    if (attacker.club === 10 && clubPro[10]) {
      if (Math.random() < 2 / 3) {
        attacker[field] += 1;
      }
      if (Math.random() < 2 / 3) {
        attacker.exp = (attacker.exp || 0) + 1;
      }
    }
  }
}

function getPrimaryFixedDamage(attacker, defender) {
  const kind = getWeaponKind(attacker.wepk);
  if (kind === 'J') {
    return (
      Math.min(Math.floor(defender.mhp / 3), 20000) +
      Math.floor((attacker.wepe * 2) / 3)
    );
  }
  if (kind === 'F') {
    return attacker.wepe;
  }
  return 0;
}

function calcDamage(attacker, defender) {
  if (combat.checkDodge(attacker, defender)) {
    return { damage: 0, critical: false, dodged: true };
  }

  const att = calcAtt(attacker);
  const def = calcDef(defender) || 1;
  const kind = getWeaponKind(attacker.wepk);
  const skill = getSkill(attacker);
  const coef = SKILL_DMG[kind] || 0.6;
  const fluc = DMG_FLUC[kind] || 15;

  let dmg = (att / def) * skill * coef;
  const randFactor = (((100 + fluc) / 100) * (4 + Math.random() * 6)) / 10;
  dmg = Math.round(dmg * randFactor);
  if (dmg < 1) dmg = 1;
  dmg += getPrimaryFixedDamage(attacker, defender);

  dmg *=
    poseMod(attacker.pose) * tacticMod(attacker.tactic) * infMod(attacker.inf);
  dmg *= 1 + Math.min(attacker.rage || 0, 100) / 100;

  const crit = combat.checkCritical(attacker, defender);
  if (crit) {
    dmg *= constants.get('CRIT_MULTIPLIER') || 1.5;
  }

  if (dmg < 1) dmg = 1;
  return { damage: Math.floor(dmg), critical: crit, dodged: false };
}

function collectItems(target) {
  const list = [];
  const equip = ['wep', 'arb', 'arh', 'ara', 'arf', 'art'];
  for (const slot of equip) {
    if (target[slot]) {
      list.push({
        slot,
        name: target[slot],
        kind: target[`${slot}k`],
        effect: target[`${slot}e`],
        uses: target[`${slot}s`],
        skill: target[`${slot}sk`],
      });
    }
  }
  for (let i = 0; i < 7; i++) {
    const name = target[`itm${i}`];
    if (name) {
      list.push({
        slot: `itm${i}`,
        name,
        kind: target[`itmk${i}`],
        effect: target[`itme${i}`],
        uses: target[`itms${i}`],
        skill: target[`itmsk${i}`],
      });
    }
  }
  return list;
}

async function attack(user, body) {
  const { pid, eid } = body;
  await checkDangerAreas();
  const info = await GameInfo.findOne();
  if (!info || info.gamestate < constants.get('START_THRESHOLD')) {
    const err = new Error('游戏未开始');
    err.status = 400;
    throw err;
  }
  const [player, enemy] = await Promise.all([
    Player.findOne({ pid, uid: user._id }),
    Player.findOne({ pid: eid })
  ]);
  if (!player) {
    const err = new Error('玩家不存在');
    err.status = 404;
    throw err;
  }
  if (player.hp <= 0) {
    const err = new Error('你已经死亡');
    err.status = 400;
    throw err;
  }
  if (!enemy) {
    const err = new Error('目标不存在');
    err.status = 404;
    throw err;
  }
  if (enemy.hp <= 0) {
    const err = new Error('目标已死亡');
    err.status = 400;
    throw err;
  }
  const memory = player.enemymemory ? JSON.parse(player.enemymemory) : null;
  if (!memory || memory.id !== eid) {
    const err = new Error('当前没有与该目标交战');
    err.status = 400;
    throw err;
  }
  await restoreMemoryItem(player);
  applyRest(player);
  const cost = constants.get('ATTACK_SP_COST');
  if (player.sp < cost) {
    const err = new Error('体力不足，不能攻击');
    err.status = 400;
    throw err;
  }
  player.sp -= cost;
  let log = '';

  const r1 = calcDamage(player, enemy);
  if (r1.dodged) {
    log += `${enemy.type > 0 ? 'NPC' : '玩家'}【${enemy.name}】闪避了你的攻击！<br>`;
  } else {
    enemy.hp = Math.max(enemy.hp - r1.damage, 0);
    consumeWeapon(player);
    gainSkill(player);
    log += `你攻击了${enemy.type > 0 ? 'NPC' : '玩家'}【${enemy.name}】，造成${r1.damage}点伤害！`;
    if (r1.critical) log += '<span class="red">暴击！</span>';
    log += '<br>';
  }
  let loot = null;
  if (enemy.hp <= 0) {
    enemy.state = 21;
    enemy.endtime = Math.floor(Date.now() / 1000);
    log += '对方被击倒了！<br>';
    loot = collectItems(enemy);
    player.enemymemory = JSON.stringify({ id: enemy.pid, corpse: true });
  } else {
    const r2 = calcDamage(enemy, player);
    if (r2.dodged) {
      log += `你闪避了${enemy.type > 0 ? 'NPC' : '玩家'}【${enemy.name}】的攻击！<br>`;
    } else {
      player.hp = Math.max(player.hp - r2.damage, 0);
      consumeWeapon(enemy);
      gainSkill(enemy);
      log += `${enemy.type > 0 ? 'NPC' : '玩家'}【${enemy.name}】反击造成${r2.damage}点伤害！`;
      if (r2.critical) log += '<span class="red">暴击！</span>';
      log += '<br>';
    }
    if (player.hp <= 0) {
      player.state = 27;
      log += '你被击倒了！<br>';
    }
  }

  const time = Math.floor(Date.now() / 1000);
  await Log.create([
    { toid: player.pid, type: 'b', time, log },
    { toid: enemy.pid, type: 'b', time, log },
  ]);
  if (!loot) player.enemymemory = '';
  enemy.enemymemory = '';
  await Promise.all([player.save(), enemy.save()]);
  const ret = {
    log,
    player: formatPlayer(player),
    enemy: {
      pid: enemy.pid,
      hp: enemy.hp,
      mhp: enemy.mhp,
      name: enemy.name,
      type: enemy.type,
      lvl: enemy.lvl,
      wep: enemy.wep,
      wepe: enemy.wepe,
    },
  };
  if (loot) ret.loot = loot;
  return ret;
}

async function escape(user, body) {
  const { pid } = body;
  await checkDangerAreas();
  const info = await GameInfo.findOne();
  if (!info || info.gamestate < constants.get('START_THRESHOLD')) {
    const err = new Error('游戏未开始');
    err.status = 400;
    throw err;
  }
  const player = await Player.findOne({ pid, uid: user._id });
  if (!player) {
    const err = new Error('玩家不存在');
    err.status = 404;
    throw err;
  }
  if (player.hp <= 0) {
    const err = new Error('你已经死亡');
    err.status = 400;
    throw err;
  }
  const memory = player.enemymemory ? JSON.parse(player.enemymemory) : null;
  if (!memory) {
    const err = new Error('没有遭遇敌人');
    err.status = 400;
    throw err;
  }
  if (!memory.initiator) {
    const err = new Error('无法逃跑');
    err.status = 400;
    throw err;
  }
  player.enemymemory = '';
  await player.save();
  const time = Math.floor(Date.now() / 1000);
  const log = '你选择逃跑，成功回避了战斗。';
  await Log.create([{ toid: player.pid, type: 'b', time, log }]);
  return { log, player: formatPlayer(player) };
}

module.exports = { attack, escape };
