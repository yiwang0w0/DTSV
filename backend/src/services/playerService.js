const Player = require('../models/Player');
const MapItem = require('../models/MapItem');
const MapTrap = require('../models/MapTrap');
const GameInfo = require('../models/GameInfo');
const MapArea = require('../models/MapArea');
const Club = require('../models/Club');
const { dropMapItem, restoreMemoryItem } = require('../utils/item');
const { START_THRESHOLD } = require('../config/constants');

function applyRest(player) {
  if (player.restStart) {
    const sec = Math.floor((Date.now() - player.restStart) / 1000);
    if (sec > 0) {
      player.sp = Math.min(player.msp, player.sp + sec * 12);
    }
    player.restStart = 0;
  }
}

function reduceItem(player, idx) {
  let cnt = player[`itms${idx}`];
  if (cnt !== '∞') {
    const num = parseInt(cnt, 10) - 1;
    if (num <= 0) {
      player[`itm${idx}`] = '';
      player[`itmk${idx}`] = '';
      player[`itme${idx}`] = 0;
      player[`itms${idx}`] = '0';
      player[`itmsk${idx}`] = '';
    } else {
      player[`itms${idx}`] = String(num);
    }
  }
}

const ammoMap = [
  { key: 'WJ', kind: 'GBh', num: 4 },
  { key: 'e', kind: 'GBe', num: 10 },
  { key: 'w', kind: 'GBe', num: 10 },
  { key: 'i', kind: 'GBi', num: 10 },
  { key: 'u', kind: 'GBi', num: 10 },
  { key: 'r', kind: 'GBr', num: 20 },
  { key: 'WG', kind: 'GB', num: 6 }
];

function checkAmmoKind(wepk, wepsk) {
  let ret = { kind: 'GB', num: 6 };
  for (const a of ammoMap) {
    if ((a.key.startsWith('W') && wepk.startsWith(a.key)) ||
        (!a.key.startsWith('W') && wepsk.includes(a.key))) {
      ret = { kind: a.kind, num: a.num };
      if (ret.num <= 10 && wepsk.includes('r')) {
        ret.num = ret.kind === 'GBh' ? 6 : 12;
      }
      break;
    }
  }
  return ret;
}

const bulletNames = {
  GB: '手枪弹药',
  GBr: '机枪弹药',
  GBi: '气体弹药',
  GBh: '重型弹药',
  GBe: '能源弹药'
};

async function clubs() {
  const clubs = await Club.find({}, 'cid name');
  return clubs;
}

async function enter(user, body) {
  const info = await GameInfo.findOne();
  if (!info || info.gamestate < START_THRESHOLD) {
    const err = new Error('游戏未开始');
    err.status = 400;
    throw err;
  }
  const gid = info.gamenum;

  let player = null;
  if (user.lastgame === gid && user.lastpid) {
    player = await Player.findOne({ pid: user.lastpid, uid: user._id });
  }

  if (!player) {
    const last = await Player.findOne().sort({ pid: -1 });
    const pid = last ? last.pid + 1 : 1;
    const { club } = body;
    let base = { hp: 100, sp: 200, att: 0, def: 0, money: 20 };
    if (club) {
      const c = await Club.findOne({ cid: club });
      if (c) {
        base.hp += c.hp;
        base.sp += c.sp;
        base.att += c.att;
        base.def += c.def;
        base.money += c.money;
      }
    }
    player = await Player.create({
      pid,
      uid: user._id,
      name: user.username,
      pls: 0,
      hp: base.hp,
      mhp: base.hp,
      sp: base.sp,
      msp: base.sp,
      att: base.att,
      def: base.def,
      money: base.money,
      club: club || 0
    });
    user.lastgame = gid;
    user.lastpid = pid;
    await user.save();
  }

  return { pid: player.pid, pls: player.pls };
}

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
  return { msg: `移动到${name}`, player };
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

  if (player.pls === 7 && Math.random() < 0.5) {
    const dmg = Math.floor(Math.random() * 10) + 1;
    player.sp = Math.max(player.sp - dmg, 0);
    log += `你脚下一滑摔进池里，消耗${dmg}点体力。<br>`;
    await player.save();
    return { log, player };
  }

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
      return { log, player };
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
    return { log, player, item };
  }

  log += '但是没有发现任何东西。';
  await player.save();
  return { log, player };
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
  return player;
}

async function list(user) {
  const info = await GameInfo.findOne();
  const gid = info ? info.gamenum : 0;
  const users = await require('../models/User').find({ lastgame: gid, lastpid: { $gt: 0 } }, 'username lastpid');
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
  return { msg: '开始休息', player };
}

async function pickItem(user, body) {
  const { pid, itemId } = body;
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

  const memory = player.searchmemory ? JSON.parse(player.searchmemory) : null;
  if (!memory || memory.id !== itemId) {
    const err = new Error('物品不存在');
    err.status = 400;
    throw err;
  }

  const item = memory;
  let slot = -1;
  for (let i = 0; i < 5; i++) {
    if (!player[`itm${i}`]) { slot = i; break; }
  }
  if (slot === -1) {
    const err = new Error('物品栏已满');
    err.status = 400;
    throw err;
  }

  player[`itm${slot}`] = item.itm;
  player[`itmk${slot}`] = item.itmk;
  player[`itme${slot}`] = item.itme;
  player[`itms${slot}`] = item.itms;
  player[`itmsk${slot}`] = item.itmsk;
  player.searchmemory = '';
  await player.save();
  return { msg: `获得了${item.itm}`, player };
}

async function useItem(user, body) {
  const { pid, index } = body;
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
  if (index < 0 || index >= 5) {
    const err = new Error('物品编号错误');
    err.status = 400;
    throw err;
  }
  const name = player[`itm${index}`];
  const kind = player[`itmk${index}`];
  const effect = player[`itme${index}`];
  if (!name) {
    const err = new Error('物品不存在');
    err.status = 400;
    throw err;
  }

  let log = '';

  if (kind.startsWith('HS')) {
    const add = Math.min(player.msp - player.sp, effect);
    if (add > 0) {
      player.sp += add;
      log = `使用了${name}，恢复了${add}点体力。`;
      reduceItem(player, index);
    } else {
      log = '你的体力不需要恢复。';
    }
  } else if (kind.startsWith('HH')) {
    const add = Math.min(player.mhp - player.hp, effect);
    if (add > 0) {
      player.hp += add;
      log = `使用了${name}，恢复了${add}点生命。`;
      reduceItem(player, index);
    } else {
      log = '你的生命不需要恢复。';
    }
  } else if (kind.startsWith('HB')) {
    const h = Math.min(player.mhp - player.hp, effect);
    const s = Math.min(player.msp - player.sp, effect);
    if (h > 0 || s > 0) {
      player.hp += h;
      player.sp += s;
      log = `使用了${name}，恢复了${h}点生命和${s}点体力。`;
      reduceItem(player, index);
    } else {
      log = '你的状态不需要恢复。';
    }
  } else if (name.includes('磨刀石')) {
    if (player.wepk && player.wepk.startsWith('WK') && !player.wepsk.includes('Z')) {
      const success = Math.random() >= 0.15;
      if (success) {
        player.wepe += effect;
        if (!player.wep.startsWith('锋利的')) player.wep = '锋利的' + player.wep;
        log = `使用了${name}，${player.wep}的攻击力变成了${player.wepe}。`;
      } else {
        player.wepe -= Math.ceil(effect / 2);
        if (player.wepe <= 0) {
          log = `${name}使用失败，${player.wep}损坏了！`;
          player.wep = player.wepk = player.wepsk = '';
          player.wepe = 0;
          player.weps = '0';
        } else {
          log = `${name}使用失败，${player.wep}的攻击力变成了${player.wepe}。`;
        }
      }
      reduceItem(player, index);
    } else {
      log = '你没装备锐器，不能使用磨刀石。';
    }
  } else if (kind.startsWith('GB')) {
    if (!player.wepk || !(player.wepk.startsWith('WG') || player.wepk.startsWith('WJ'))) {
      log = '你没有装备枪械，不能使用子弹。';
    } else if (player.wepsk.includes('o')) {
      log = `${player.wep}不能装填弹药。`;
    } else {
      const { kind: bkind, num: clip } = checkAmmoKind(player.wepk, player.wepsk);
      if (kind !== bkind) {
        log = `弹药类型不匹配，需要${bulletNames[bkind] || bkind}。`;
      } else {
        let cur = player.weps === '∞' ? clip : parseInt(player.weps, 10);
        if (cur >= clip) {
          log = `${player.wep}的弹匣是满的，不能装弹。`;
        } else {
          let remain = player[`itms${index}`] === '∞' ? clip : parseInt(player[`itms${index}`], 10);
          const add = Math.min(remain, clip - cur);
          if (player[`itms${index}`] !== '∞') {
            player[`itms${index}`] = String(remain - add);
            if (parseInt(player[`itms${index}`], 10) <= 0) {
              player[`itm${index}`] = '';
              player[`itmk${index}`] = '';
              player[`itme${index}`] = 0;
              player[`itms${index}`] = '0';
              player[`itmsk${index}`] = '';
            }
          }
          player.weps = String(cur + add);
          log = `为${player.wep}装填了${name}，${player.wep}残弹数增加${add}。`;
        }
      }
    }
  } else if (kind.startsWith('X')) {
    log = `你使用了${name}，但是什么也没有发生。`;
  } else {
    log = `你使用了${name}，但是什么也没有发生。`;
    reduceItem(player, index);
  }

  await player.save();
  return { msg: log, player };
}

async function equip(user, body) {
  const { pid, index } = body;
  const player = await Player.findOne({ pid, uid: user._id });
  if (!player) {
    const err = new Error('玩家不存在');
    err.status = 404;
    throw err;
  }
  if (index < 0 || index >= 5) {
    const err = new Error('物品编号错误');
    err.status = 400;
    throw err;
  }
  if (player.hp <= 0) {
    const err = new Error('你已经死亡');
    err.status = 400;
    throw err;
  }
  const name = player[`itm${index}`];
  const kind = player[`itmk${index}`];
  if (!name) {
    const err = new Error('物品不存在');
    err.status = 400;
    throw err;
  }

  let slotName = '';
  if (kind.startsWith('W')) {
    slotName = 'wep';
  } else if (kind.startsWith('DB')) {
    slotName = 'arb';
  } else if (kind.startsWith('DH')) {
    slotName = 'arh';
  } else if (kind.startsWith('DA')) {
    slotName = 'ara';
  } else if (kind.startsWith('DF')) {
    slotName = 'arf';
  } else if (kind.startsWith('A')) {
    slotName = 'art';
  } else {
    const err = new Error('无法装备该物品');
    err.status = 400;
    throw err;
  }

  if (player[slotName]) {
    let empty = -1;
    for (let i = 0; i < 5; i++) {
      if (!player[`itm${i}`]) { empty = i; break; }
    }
    if (empty !== -1) {
      player[`itm${empty}`] = player[slotName];
      player[`itmk${empty}`] = player[`${slotName}k`];
      player[`itme${empty}`] = player[`${slotName}e`];
      player[`itms${empty}`] = player[`${slotName}s`];
      player[`itmsk${empty}`] = player[`${slotName}sk`];
    } else {
      await dropMapItem(
        player.pls,
        player[slotName],
        player[`${slotName}k`],
        player[`${slotName}e`],
        String(player[`${slotName}s`]),
        player[`${slotName}sk`]
      );
    }
  }

  if (slotName === 'wep') {
    player.wep = name;
    player.wepk = kind;
    player.wepe = player[`itme${index}`];
    player.weps = player[`itms${index}`];
    player.wepsk = player[`itmsk${index}`];
  } else if (slotName === 'arb') {
    player.arb = name;
    player.arbk = kind;
    player.arbe = player[`itme${index}`];
    player.arbs = player[`itms${index}`];
    player.arbsk = player[`itmsk${index}`];
  } else if (slotName === 'arh') {
    player.arh = name;
    player.arhk = kind;
    player.arhe = player[`itme${index}`];
    player.arhs = player[`itms${index}`];
    player.arhsk = player[`itmsk${index}`];
  } else if (slotName === 'ara') {
    player.ara = name;
    player.arak = kind;
    player.arae = player[`itme${index}`];
    player.aras = player[`itms${index}`];
    player.arask = player[`itmsk${index}`];
  } else if (slotName === 'arf') {
    player.arf = name;
    player.arfk = kind;
    player.arfe = player[`itme${index}`];
    player.arfs = player[`itms${index}`];
    player.arfsk = player[`itmsk${index}`];
  } else if (slotName === 'art') {
    player.art = name;
    player.artk = kind;
    player.arte = player[`itme${index}`];
    player.arts = player[`itms${index}`];
    player.artsk = player[`itmsk${index}`];
  }

  player[`itm${index}`] = '';
  player[`itmk${index}`] = '';
  player[`itme${index}`] = 0;
  player[`itms${index}`] = '0';
  player[`itmsk${index}`] = '';
  await player.save();
  return { msg: `装备了${name}`, player };
}

async function unequip(user, body) {
  const { pid, slot } = body;
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
  const allow = ['wep', 'arb', 'arh', 'ara', 'arf', 'art'];
  if (!allow.includes(slot)) {
    const err = new Error('装备栏错误');
    err.status = 400;
    throw err;
  }
  const name = player[slot];
  if (!name) {
    const err = new Error('没有装备');
    err.status = 400;
    throw err;
  }

  let empty = -1;
  for (let i = 0; i < 5; i++) {
    if (!player[`itm${i}`]) { empty = i; break; }
  }
  if (empty === -1) {
    const err = new Error('物品栏已满');
    err.status = 400;
    throw err;
  }

  player[`itm${empty}`] = player[slot];
  player[`itmk${empty}`] = player[`${slot}k`];
  player[`itme${empty}`] = player[`${slot}e`];
  player[`itms${empty}`] = player[`${slot}s`];
  player[`itmsk${empty}`] = player[`${slot}sk`];

  player[slot] = '';
  player[`${slot}k`] = '';
  player[`${slot}e`] = 0;
  player[`${slot}s`] = '0';
  player[`${slot}sk`] = '';
  await player.save();
  return { msg: `卸下了${name}`, player };
}

async function pickReplace(user, body) {
  const { pid, itemId, index } = body;
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
  if (index < 0 || index >= 5) {
    const err = new Error('物品编号错误');
    err.status = 400;
    throw err;
  }

  const memory = player.searchmemory ? JSON.parse(player.searchmemory) : null;
  if (!memory || memory.id !== itemId) {
    const err = new Error('物品不存在');
    err.status = 400;
    throw err;
  }
  const item = memory;

  const dropName = player[`itm${index}`];
  const dropKind = player[`itmk${index}`];
  const dropEffect = player[`itme${index}`];
  const dropUses = String(player[`itms${index}`]);
  const dropSkill = player[`itmsk${index}`];

  if (dropName) {
    await dropMapItem(
      player.pls,
      dropName,
      dropKind,
      dropEffect,
      dropUses,
      dropSkill
    );
  }

  player[`itm${index}`] = item.itm;
  player[`itmk${index}`] = item.itmk;
  player[`itme${index}`] = item.itme;
  player[`itms${index}`] = item.itms;
  player[`itmsk${index}`] = item.itmsk;
  player.searchmemory = '';

  await player.save();
  return { msg: `获得了${item.itm}`, player, dropName };
}

async function pickEquip(user, body) {
  const { pid, itemId } = body;
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

  const memory = player.searchmemory ? JSON.parse(player.searchmemory) : null;
  if (!memory || memory.id !== itemId) {
    const err = new Error('物品不存在');
    err.status = 400;
    throw err;
  }
  const item = memory;

  let slotName = '';
  if (item.itmk.startsWith('W')) slotName = 'wep';
  else if (item.itmk.startsWith('DB')) slotName = 'arb';
  else if (item.itmk.startsWith('DH')) slotName = 'arh';
  else if (item.itmk.startsWith('DA')) slotName = 'ara';
  else if (item.itmk.startsWith('DF')) slotName = 'arf';
  else if (item.itmk.startsWith('A')) slotName = 'art';
  else {
    const err = new Error('无法装备该物品');
    err.status = 400;
    throw err;
  }

  if (player[slotName]) {
    let empty = -1;
    for (let i = 0; i < 5; i++) {
      if (!player[`itm${i}`]) { empty = i; break; }
    }
    if (empty !== -1) {
      player[`itm${empty}`] = player[slotName];
      player[`itmk${empty}`] = player[`${slotName}k`];
      player[`itme${empty}`] = player[`${slotName}e`];
      player[`itms${empty}`] = player[`${slotName}s`];
      player[`itmsk${empty}`] = player[`${slotName}sk`];
    } else {
      await dropMapItem(
        player.pls,
        player[slotName],
        player[`${slotName}k`],
        player[`${slotName}e`],
        String(player[`${slotName}s`]),
        player[`${slotName}sk`]
      );
    }
  }

  player[slotName] = item.itm;
  player[`${slotName}k`] = item.itmk;
  player[`${slotName}e`] = item.itme;
  player[`${slotName}s`] = item.itms;
  player[`${slotName}sk`] = item.itmsk;

  player.searchmemory = '';
  await player.save();
  return { msg: `装备了${item.itm}`, player };
}

module.exports = {
  clubs,
  enter,
  move,
  search,
  status,
  list,
  rest,
  pickItem,
  useItem,
  equip,
  unequip,
  pickReplace,
  pickEquip
};
