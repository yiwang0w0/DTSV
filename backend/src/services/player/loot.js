const Player = require('../../models/Player');
const Log = require('../../models/Log');
const { formatPlayer } = require('./utils');

async function lootItem(user, body) {
  const { pid, corpseId, slot } = body;
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
  if (!memory || memory.id !== corpseId || !memory.corpse) {
    const err = new Error('没有可拾取的尸体');
    err.status = 400;
    throw err;
  }

  const enemy = await Player.findOne({ pid: corpseId });
  if (!enemy) {
    const err = new Error('目标不存在');
    err.status = 404;
    throw err;
  }
  if (enemy.hp > 0) {
    const err = new Error('目标未死亡');
    err.status = 400;
    throw err;
  }

  const bagSlots = Array.from({ length: 7 }, (_, i) => `itm${i}`);
  const equipSlots = ['wep', 'arb', 'arh', 'ara', 'arf', 'art'];
  let item = null;
  if (bagSlots.includes(slot)) {
    const idx = Number(slot.slice(3));
    if (!enemy[slot]) {
      const err = new Error('物品不存在');
      err.status = 400;
      throw err;
    }
    item = {
      name: enemy[slot],
      kind: enemy[`itmk${idx}`],
      effect: enemy[`itme${idx}`],
      uses: enemy[`itms${idx}`],
      skill: enemy[`itmsk${idx}`],
    };
    enemy[slot] = '';
    enemy[`itmk${idx}`] = '';
    enemy[`itme${idx}`] = 0;
    enemy[`itms${idx}`] = '0';
    enemy[`itmsk${idx}`] = '';
  } else if (equipSlots.includes(slot)) {
    if (!enemy[slot]) {
      const err = new Error('物品不存在');
      err.status = 400;
      throw err;
    }
    item = {
      name: enemy[slot],
      kind: enemy[`${slot}k`],
      effect: enemy[`${slot}e`],
      uses: enemy[`${slot}s`],
      skill: enemy[`${slot}sk`],
    };
    enemy[slot] = '';
    enemy[`${slot}k`] = '';
    enemy[`${slot}e`] = 0;
    enemy[`${slot}s`] = '0';
    enemy[`${slot}sk`] = '';
  } else {
    const err = new Error('槽位错误');
    err.status = 400;
    throw err;
  }

  let empty = -1;
  for (let i = 0; i < 7; i++) {
    if (!player[`itm${i}`]) {
      empty = i;
      break;
    }
  }
  if (empty === -1) {
    const err = new Error('物品栏已满');
    err.status = 400;
    throw err;
  }

  player[`itm${empty}`] = item.name;
  player[`itmk${empty}`] = item.kind;
  player[`itme${empty}`] = item.effect;
  player[`itms${empty}`] = item.uses;
  player[`itmsk${empty}`] = item.skill;

  player.enemymemory = '';
  const time = Math.floor(Date.now() / 1000);
  const log = `你从${enemy.type > 0 ? 'NPC' : '玩家'}【${enemy.name}】的尸体上获得了${item.name}。`;
  await Log.create([{ toid: player.pid, type: 'b', time, log }]);
  await Promise.all([player.save(), enemy.save()]);
  return { msg: log, player: formatPlayer(player) };
}

module.exports = { lootItem };
