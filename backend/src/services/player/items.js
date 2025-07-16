const Player = require('../../models/Player');
const MapItem = require('../../models/MapItem');
const playerUtils = require('./utils');
const { dropMapItem } = playerUtils;
const { checkAmmoKind, bulletNames, reduceItem, formatPlayer } = playerUtils;

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
  return { msg: `获得了${item.itm}`, player: formatPlayer(player) };
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

  // 装备类型物品的 "使用" 等同于装备
  if (/^(W|DB|DH|DA|DF|A)/.test(kind)) {
    return equip(user, { pid, index });
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
  return { msg: log, player: formatPlayer(player) };
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

  let oldName = '';
  let oldKind = '';
  let oldEffect = 0;
  let oldUses = '0';
  let oldSkill = '';
  if (player[slotName]) {
    oldName = player[slotName];
    oldKind = player[`${slotName}k`];
    oldEffect = player[`${slotName}e`];
    oldUses = String(player[`${slotName}s`]);
    oldSkill = player[`${slotName}sk`];
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

  if (oldName) {
    player[`itm${index}`] = oldName;
    player[`itmk${index}`] = oldKind;
    player[`itme${index}`] = oldEffect;
    player[`itms${index}`] = oldUses;
    player[`itmsk${index}`] = oldSkill;
  } else {
    player[`itm${index}`] = '';
    player[`itmk${index}`] = '';
    player[`itme${index}`] = 0;
    player[`itms${index}`] = '0';
    player[`itmsk${index}`] = '';
  }
  await player.save();
  return { msg: `装备了${name}`, player: formatPlayer(player) };
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
  return { msg: `卸下了${name}`, player: formatPlayer(player) };
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
  return { msg: `获得了${item.itm}`, player: formatPlayer(player), dropName };
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
  return { msg: `装备了${item.itm}`, player: formatPlayer(player) };
}

module.exports = {
  pickItem,
  useItem,
  equip,
  unequip,
  pickReplace,
  pickEquip
};
