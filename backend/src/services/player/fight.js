const Player = require('../../models/Player');
const GameInfo = require('../../models/GameInfo');
const { START_THRESHOLD } = require('../../config/constants');
const { checkDangerAreas } = require('../gameService');
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
  const att = calcAtt(player);
  const def = calcDef(enemy);
  let dmg = Math.floor(att - def / 2);
  dmg = Math.floor(dmg * (0.8 + Math.random() * 0.4));
  if(dmg < 1) dmg = 1;
  enemy.hp = Math.max(enemy.hp - dmg, 0);
  let log = `你攻击了${enemy.type>0?'NPC':'玩家'}【${enemy.name}】，造成${dmg}点伤害！<br>`;
  if(enemy.hp <= 0){
    enemy.state = 21;
    enemy.endtime = Math.floor(Date.now()/1000);
    log += '对方被击倒了！<br>';
  }
  await enemy.save();
  await player.save();
  return { log, player: formatPlayer(player), enemy: { pid: enemy.pid, hp: enemy.hp, name: enemy.name } };
}

async function escape(user, body){
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
  const cost = 10;
  if(player.sp < cost){
    const err = new Error('体力不足，不能逃跑');
    err.status = 400;
    throw err;
  }
  player.sp -= cost;
  let chance = 0.5 + (player.sp - enemy.sp) / 200;
  if(chance < 0.1) chance = 0.1;
  if(chance > 0.9) chance = 0.9;
  let log = '';
  if(Math.random() < chance){
    log = `你成功逃离了${enemy.type>0?'NPC':'玩家'}【${enemy.name}】！`;
  }else{
    const att = calcAtt(enemy);
    const def = calcDef(player);
    let dmg = Math.floor(att - def / 2);
    dmg = Math.floor(dmg * (0.5 + Math.random() * 0.3));
    if(dmg < 1) dmg = 1;
    player.hp = Math.max(player.hp - dmg, 0);
    log = `逃跑失败，你受到${dmg}点伤害！`;
    if(player.hp <= 0){
      player.state = 27;
      log += '<br>你被击倒了！';
    }
  }
  await enemy.save();
  await player.save();
  return { log, player: formatPlayer(player) };
}

module.exports = { attack, escape };
