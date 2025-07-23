const Player = require('../../models/Player');
const GameInfo = require('../../models/GameInfo');
const Log = require('../../models/Log');
const { START_THRESHOLD } = require('../../config/constants');
const { checkDangerAreas } = require('../gameService');
// 引入完整工具避免解构失败
const playerUtils = require('./utils');
const { applyRest, restoreMemoryItem, formatPlayer } = playerUtils;

function calcAtt(p){
  return Number(p.att) + Number(p.wepe || 0) * 2;
}
function calcDef(p){
  return (
    Number(p.def) +
    Number(p.arbe || 0) +
    Number(p.arhe || 0) +
    Number(p.arae || 0) +
    Number(p.arfe || 0) +
    Number(p.arte || 0)
  );
}

function consumeWeapon(attacker){
  if(!attacker.wep) return;
  let uses = attacker.weps;
  if(uses !== '∞'){
    const num = parseInt(uses,10)-1;
    attacker.weps = String(num);
    if(num <= 0){
      attacker.wep = attacker.wepk = attacker.wepsk = '';
      attacker.wepe = 0;
      attacker.weps = '0';
    }
  }
}

function poseMod(pose){
  switch(Number(pose)){
    case 2: return 0.9; //防御姿势
    case 4: return 1.2; //攻击姿势
    default: return 1;
  }
}

function tacticMod(tactic){
  switch(Number(tactic)){
    case 2: return 1.1; //主动进攻
    case 4: return 0.8; //谨慎防御
    default: return 1;
  }
}

function infMod(inf){
  let m = 1;
  if(!inf) return m;
  if(inf.includes('h')) m *= 0.9;
  if(inf.includes('b') || inf.includes('f')) m *= 0.95;
  return m;
}

function weaponMod(wepk){
  if(!wepk) return 1;
  if(wepk.startsWith('WK')) return 1.1;
  if(wepk.startsWith('WG')) return 1.2;
  if(wepk.startsWith('WD')) return 1.3;
  if(wepk.startsWith('WC')) return 0.9;
  return 1;
}

function calcDamage(attacker, defender){
  const att = calcAtt(attacker);
  const def = calcDef(defender);
  let dmg = att * weaponMod(attacker.wepk);
  dmg *= poseMod(attacker.pose) * tacticMod(attacker.tactic) * infMod(attacker.inf);
  dmg *= 1 + Math.min(attacker.rage || 0, 100) / 100;
  dmg -= def * 0.3;
  dmg *= 0.8 + Math.random() * 0.4;
  if(dmg < 1) dmg = 1;
  return Math.floor(dmg);
}

async function attack(user, body){
  const { pid, eid } = body;
  await checkDangerAreas();
  const info = await GameInfo.findOne();
  if(!info || info.gamestate < START_THRESHOLD){
    const err = new Error('游戏未开始');
    err.status = 400;
    throw err;
  }
  const player = await Player.findOne({ pid, uid: user._id });
  if(!player){
    const err = new Error('玩家不存在');
    err.status = 404;
    throw err;
  }
  if(player.hp <= 0){
    const err = new Error('你已经死亡');
    err.status = 400;
    throw err;
  }
  const enemy = await Player.findOne({ pid: eid });
  if(!enemy){
    const err = new Error('目标不存在');
    err.status = 404;
    throw err;
  }
  if(enemy.hp <= 0){
    const err = new Error('目标已死亡');
    err.status = 400;
    throw err;
  }
  await restoreMemoryItem(player);
  applyRest(player);
  const cost = 20;
  if(player.sp < cost){
    const err = new Error('体力不足，不能攻击');
    err.status = 400;
    throw err;
  }
  player.sp -= cost;
  let log = '';

  const dmg1 = calcDamage(player, enemy);
  enemy.hp = Math.max(enemy.hp - dmg1, 0);
  consumeWeapon(player);
  log += `你攻击了${enemy.type>0?'NPC':'玩家'}【${enemy.name}】，造成${dmg1}点伤害！<br>`;
  if(enemy.hp <= 0){
    enemy.state = 21;
    enemy.endtime = Math.floor(Date.now()/1000);
    log += '对方被击倒了！<br>';
  }else{
    const dmg2 = calcDamage(enemy, player);
    player.hp = Math.max(player.hp - dmg2, 0);
    consumeWeapon(enemy);
    log += `${enemy.type>0?'NPC':'玩家'}【${enemy.name}】反击造成${dmg2}点伤害！<br>`;
    if(player.hp <= 0){
      player.state = 27;
      log += '你被击倒了！<br>';
    }
  }

  await Promise.all([enemy.save(), player.save()]);

  const time = Math.floor(Date.now()/1000);
  await Log.create([
    { toid: player.pid, type: 'b', time, log },
    { toid: enemy.pid, type: 'b', time, log }
  ]);

  return { log, player: formatPlayer(player), enemy: { pid: enemy.pid, hp: enemy.hp, mhp: enemy.mhp, name: enemy.name, type: enemy.type, lvl: enemy.lvl, wep: enemy.wep, wepe: enemy.wepe } };
}

module.exports = { attack };
