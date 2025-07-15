const Player = require('../../models/Player');
const GameInfo = require('../../models/GameInfo');
const MapArea = require('../../models/MapArea');
const MapItem = require('../../models/MapItem');
const MapTrap = require('../../models/MapTrap');
const { START_THRESHOLD } = require('../../config/constants');
const { applyRest, restoreMemoryItem, formatPlayer } = require('./utils');

async function move(user, body) {
  const { pid, pls } = body;
  const info = await GameInfo.findOne();
  if (!info || info.gamestate < START_THRESHOLD) {
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

  await restoreMemoryItem(player);
  applyRest(player);

  const spCost = 20 + Math.floor(Math.random() * 21) - 10;
  if (player.sp < spCost) {
    const err = new Error('体力不足，不能移动');
    err.status = 400;
    throw err;
  }
  player.sp -= spCost;
  player.pls = pls;
  await player.save();

  const area = await MapArea.findOne({ pid: pls });
  const name = area ? area.name : pls;
  return { msg: `移动到${name}`, player: formatPlayer(player) };
}

async function search(user, body) {
  const { pid } = body;
  const info = await GameInfo.findOne();
  if (!info || info.gamestate < START_THRESHOLD) {
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

  await restoreMemoryItem(player);
  applyRest(player);

  const spCost = 10 + Math.floor(Math.random() * 11) - 5;
  if (player.sp < spCost) {
    const err = new Error('体力不足，不能探索');
    err.status = 400;
    throw err;
  }
  player.sp -= spCost;

  let log = '';

  // 1. 特殊地图事件
  if (player.pls === 7 && Math.random() < 0.5) {
    const dmg = Math.floor(Math.random() * 10) + 1;
    player.sp = Math.max(player.sp - dmg, 0);
    log += `你脚下一滑摔进池里，消耗${dmg}点体力。<br>`;
    await player.save();
    return { log, player: formatPlayer(player) };
  }

  // 2. 陷阱事件
  if (Math.random() < 0.05) {
    const traps = await MapTrap.find({ pls: player.pls });
    if (traps.length) {
      const trap = traps[Math.floor(Math.random() * traps.length)];
      await MapTrap.deleteOne({ _id: trap._id });
      const dmg = trap.itme || 0;
      player.hp = Math.max(player.hp - dmg, 0);
      log += `你触发了陷阱【${trap.itm}】，受到了${dmg}点伤害！<br>`;
      if (player.hp <= 0) {
        player.state = 27;
        log += '你被陷阱杀死了！<br>';
      }
      await player.save();
      return { log, player: formatPlayer(player) };
    }
  }

  // 3. 遭遇敌人事件
  const enemies = await Player.find({ pls: player.pls, hp: { $gt: 0 }, pid: { $ne: pid } });
  if (enemies.length) {
    const enemy = enemies[Math.floor(Math.random() * enemies.length)];
    let chance = 0.5 + (player.sp - enemy.sp) / 200;
    if (enemy.type > 0) chance -= 0.05;
    if (chance < 0.05) chance = 0.05;
    if (chance > 0.95) chance = 0.95;
    if (Math.random() < chance) {
      if (enemy.type > 0) {
        if (enemy.sp > player.sp) {
          const dmg = Math.floor(Math.random() * 10) + 1;
          player.hp = Math.max(player.hp - dmg, 0);
          log += `NPC【${enemy.name}】的伏击使你受到${dmg}点伤害！<br>`;
          if (player.hp <= 0) {
            player.state = 27;
            log += '你遭到致命打击！<br>';
          }
        } else {
          log += `你发现了NPC【${enemy.name}】，可以选择攻击。<br>`;
        }
      } else {
        log += `你发现了玩家【${enemy.name}】！<br>`;
      }
      await player.save();
      return { log, player: formatPlayer(player), enemy: { pid: enemy.pid, name: enemy.name, type: enemy.type } };
    }
  }

  const items = await MapItem.find({ pls: player.pls });
  if (items.length && Math.random() < 0.6) {
    const item = items[Math.floor(Math.random() * items.length)];
    await MapItem.deleteOne({ _id: item._id });
    player.searchmemory = JSON.stringify({
      id: String(item._id),
      itm: item.itm,
      itmk: item.itmk,
      itme: item.itme,
      itms: String(item.itms),
      itmsk: item.itmsk,
      pls: item.pls
    });
    log += `你发现了${item.itm}。<br>`;
    await player.save();
    return { log, player: formatPlayer(player), item };
  }

  log += '但是没有发现任何东西。';
  await player.save();
  return { log, player: formatPlayer(player) };
}

async function status(user, query) {
  const { pid } = query;
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
  return formatPlayer(player);
}

async function deadStatus(user, query) {
  const { pid } = query;
  const player = await Player.findOne({ pid, uid: user._id });
  if (!player) {
    const err = new Error('玩家不存在');
    err.status = 404;
    throw err;
  }
  return player;
}

async function list(user) {
  const info = await GameInfo.findOne();
  const gid = info ? info.gamenum : 0;
  const users = await require('../../models/User').find({ lastgame: gid, lastpid: { $gt: 0 } }, 'username lastpid');
  const pids = users.map(u => u.lastpid);
  const players = await Player.find({ pid: { $in: pids }, uid: user._id }, 'pid name hp');
  const map = {};
  players.forEach(p => { map[p.pid] = p; });
  return users.map(u => {
    const p = map[u.lastpid] || {};
    return { pid: u.lastpid, name: p.name || '', username: u.username, alive: p.hp > 0 };
  });
}

async function rest(user, body) {
  const { pid } = body;
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
  player.restStart = Date.now();
  await player.save();
  return { msg: '开始休息', player: formatPlayer(player) };
}

module.exports = { move, search, status, deadStatus, list, rest };
