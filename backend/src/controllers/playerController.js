const Player = require('../models/Player');
const MapItem = require('../models/MapItem');
const MapTrap = require('../models/MapTrap');
const GameInfo = require('../models/GameInfo');
const MapArea = require('../models/MapArea');

const START_THRESHOLD = 20;

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

async function dropMapItem(pls, name, kind, effect, uses, skill) {
  if (!name) return;
  await MapItem.create({
    itm: name,
    itmk: kind,
    itme: effect,
    itms: uses,
    itmsk: skill,
    pls
  });
}

exports.enter = async (req, res) => {
  try {
    const user = req.user;
    const info = await GameInfo.findOne();
    if (!info || info.gamestate < START_THRESHOLD) {
      return res.status(400).json({ msg: '游戏未开始' });
    }
    const gid = info.gamenum;

    let player = null;
    if (user.lastgame === gid && user.lastpid) {
      player = await Player.findOne({ pid: user.lastpid, uid: user._id });
    }

    if (!player) {
      const last = await Player.findOne().sort({ pid: -1 });
      const pid = last ? last.pid + 1 : 1;
      player = await Player.create({
        pid,
        uid: user._id,
        name: user.username,
        pls: 0,
        hp: 100,
        mhp: 100,
        sp: 200,
        msp: 200
      });
      user.lastgame = gid;
      user.lastpid = pid;
      await user.save();
    }

    res.json({ pid: player.pid, pls: player.pls });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: '进入游戏失败' });
  }
};

exports.move = async (req, res) => {
  try {
    const { pid, pls } = req.body;
    const info = await GameInfo.findOne();
    if (!info || info.gamestate < START_THRESHOLD) {
      return res.status(400).json({ msg: '游戏未开始' });
    }
    const player = await Player.findOne({ pid, uid: req.user._id });
    if (!player) return res.status(404).json({ msg: '玩家不存在' });

    applyRest(player);

    const spCost = 20 + Math.floor(Math.random() * 21) - 10;
    if (player.sp < spCost) {
      return res.status(400).json({ msg: '体力不足，不能移动' });
    }
    player.sp -= spCost;
    player.pls = pls;
    await player.save();

    const area = await MapArea.findOne({ pid: pls });
    const name = area ? area.name : pls;
    res.json({ msg: `移动到${name}`, player });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: '移动失败' });
  }
};

exports.search = async (req, res) => {
  try {
    const { pid } = req.body;
    const info = await GameInfo.findOne();
    if (!info || info.gamestate < START_THRESHOLD) {
      return res.status(400).json({ msg: '游戏未开始' });
    }
  const player = await Player.findOne({ pid, uid: req.user._id });
  if (!player) return res.status(404).json({ msg: '玩家不存在' });

  applyRest(player);
  const spCost = 10 + Math.floor(Math.random() * 11) - 5;
  if (player.sp < spCost) {
    return res.status(400).json({ msg: '体力不足，不能探索' });
  }
  player.sp -= spCost;

  const ITEM_FIND_RATE = 0.6;

  let log = '';

    if (player.pls === 7 && Math.random() < 0.5) {
      const dmg = Math.floor(Math.random() * 10) + 1;
      player.sp = Math.max(player.sp - dmg, 0);
      log += `你脚下一滑摔进池里，消耗${dmg}点体力。<br>`;
      await player.save();
      return res.json({ log, player });
    }

    const trap = await MapTrap.findOne({ pls: player.pls });
    if (trap) {
      await trap.deleteOne();
      log += `你触发了陷阱【${trap.itm}】！<br>`;
      await player.save();
      return res.json({ log, player });
    }

    const items = await MapItem.find({ pls: player.pls });
    if (items.length && Math.random() < ITEM_FIND_RATE) {
      const item = items[Math.floor(Math.random() * items.length)];
      log += `你发现了${item.itm}。<br>`;
      await player.save();
      return res.json({ log, player, item });
    }

    await player.save();
    log += '但是没有发现任何东西。';
    res.json({ log, player });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: '搜索失败' });
  }
};


exports.status = async (req, res) => {
  try {
    const { pid } = req.query;
    const player = await Player.findOne({ pid, uid: req.user._id });
    if (!player) {
      return res.status(404).json({ msg: '玩家不存在' });
    }
    res.json(player);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: '获取状态失败' });
  }
};

exports.list = async (req, res) => {
  try {
    const info = await GameInfo.findOne();
    const gid = info ? info.gamenum : 0;
    const users = await require('../models/User').find({ lastgame: gid, lastpid: { $gt: 0 } }, 'username lastpid');
    const pids = users.map(u => u.lastpid);
    const players = await Player.find({ pid: { $in: pids }, uid: req.user._id }, 'pid name hp');
    const map = {};
    players.forEach(p => { map[p.pid] = p; });
    const list = users.map(u => {
      const p = map[u.lastpid] || {};
      return { pid: u.lastpid, name: p.name || '', username: u.username, alive: p.hp > 0 };
    });
    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: '获取玩家列表失败' });
  }
};

exports.rest = async (req, res) => {
  try {
    const { pid } = req.body;
  const player = await Player.findOne({ pid, uid: req.user._id });
  if (!player) return res.status(404).json({ msg: '玩家不存在' });
  player.restStart = Date.now();
  await player.save();
  res.json({ msg: '开始休息', player });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: '休息失败' });
  }
};

exports.pickItem = async (req, res) => {
  try {
    const { pid, itemId } = req.body;
    const player = await Player.findOne({ pid, uid: req.user._id });
    if (!player) return res.status(404).json({ msg: '玩家不存在' });

    const item = await MapItem.findOne({ _id: itemId, pls: player.pls });
    if (!item) return res.status(400).json({ msg: '物品不存在' });

    let slot = -1;
    for (let i = 0; i < 5; i++) {
      if (!player[`itm${i}`]) { slot = i; break; }
    }
    if (slot === -1) return res.status(400).json({ msg: '物品栏已满' });

    player[`itm${slot}`] = item.itm;
    player[`itmk${slot}`] = item.itmk;
    player[`itme${slot}`] = item.itme;
    player[`itms${slot}`] = item.itms;
    player[`itmsk${slot}`] = item.itmsk;
    await item.deleteOne();
    await player.save();
    res.json({ msg: `获得了${item.itm}`, player });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: '拾取失败' });
  }
};

exports.useItem = async (req, res) => {
  try {
    const { pid, index } = req.body;
    const player = await Player.findOne({ pid, uid: req.user._id });
    if (!player) return res.status(404).json({ msg: '玩家不存在' });
    if (index < 0 || index >= 5) return res.status(400).json({ msg: '物品编号错误' });
    const name = player[`itm${index}`];
    const kind = player[`itmk${index}`];
    const effect = player[`itme${index}`];
    if (!name) return res.status(400).json({ msg: '物品不存在' });

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
    } else if (kind.startsWith('X')) {
      // 合成素材不会产生效果，也不会消耗
      log = `你使用了${name}，但是什么也没有发生。`;
    } else {
      log = `你使用了${name}，但是什么也没有发生。`;
      reduceItem(player, index);
    }

    await player.save();
    res.json({ msg: log, player });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: '使用失败' });
  }
};

exports.equip = async (req, res) => {
  try {
    const { pid, index } = req.body;
    const player = await Player.findOne({ pid, uid: req.user._id });
    if (!player) return res.status(404).json({ msg: '玩家不存在' });
    if (index < 0 || index >= 5) return res.status(400).json({ msg: '物品编号错误' });
    const name = player[`itm${index}`];
    const kind = player[`itmk${index}`];
    if (!name) return res.status(400).json({ msg: '物品不存在' });

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
      return res.status(400).json({ msg: '无法装备该物品' });
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
          player[`${slotName}s`],
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
    res.json({ msg: `装备了${name}`, player });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: '装备失败' });
  }
};

exports.unequip = async (req, res) => {
  try {
    const { pid, slot } = req.body;
    const player = await Player.findOne({ pid, uid: req.user._id });
    if (!player) return res.status(404).json({ msg: '玩家不存在' });
    const allow = ['wep', 'arb', 'arh', 'ara', 'arf', 'art'];
    if (!allow.includes(slot)) return res.status(400).json({ msg: '装备栏错误' });
    const name = player[slot];
    if (!name) return res.status(400).json({ msg: '没有装备' });

    let empty = -1;
    for (let i = 0; i < 5; i++) {
      if (!player[`itm${i}`]) { empty = i; break; }
    }
    if (empty === -1) return res.status(400).json({ msg: '物品栏已满' });

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
    res.json({ msg: `卸下了${name}`, player });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: '卸下失败' });
  }
};

exports.pickReplace = async (req, res) => {
  try {
    const { pid, itemId, index } = req.body;
    const player = await Player.findOne({ pid, uid: req.user._id });
    if (!player) return res.status(404).json({ msg: '玩家不存在' });
    if (index < 0 || index >= 5) return res.status(400).json({ msg: '物品编号错误' });

    const item = await MapItem.findOne({ _id: itemId, pls: player.pls });
    if (!item) return res.status(400).json({ msg: '物品不存在' });

    const dropName = player[`itm${index}`];
    const dropKind = player[`itmk${index}`];
    const dropEffect = player[`itme${index}`];
    const dropUses = player[`itms${index}`];
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

    await item.deleteOne();
    await player.save();
    res.json({ msg: `获得了${item.itm}`, player });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: '拾取失败' });
  }
};

exports.pickEquip = async (req, res) => {
  try {
    const { pid, itemId } = req.body;
    const player = await Player.findOne({ pid, uid: req.user._id });
    if (!player) return res.status(404).json({ msg: '玩家不存在' });

    const item = await MapItem.findOne({ _id: itemId, pls: player.pls });
    if (!item) return res.status(400).json({ msg: '物品不存在' });

    let slotName = '';
    if (item.itmk.startsWith('W')) slotName = 'wep';
    else if (item.itmk.startsWith('DB')) slotName = 'arb';
    else if (item.itmk.startsWith('DH')) slotName = 'arh';
    else if (item.itmk.startsWith('DA')) slotName = 'ara';
    else if (item.itmk.startsWith('DF')) slotName = 'arf';
    else if (item.itmk.startsWith('A')) slotName = 'art';
    else return res.status(400).json({ msg: '无法装备该物品' });

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
          player[`${slotName}s`],
          player[`${slotName}sk`]
        );
      }
    }

    player[slotName] = item.itm;
    player[`${slotName}k`] = item.itmk;
    player[`${slotName}e`] = item.itme;
    player[`${slotName}s`] = item.itms;
    player[`${slotName}sk`] = item.itmsk;

    await item.deleteOne();
    await player.save();
    res.json({ msg: `装备了${item.itm}`, player });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: '装备失败' });
  }
};
