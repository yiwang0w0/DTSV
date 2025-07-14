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
        sp: 100,
        msp: 100
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
  const spCost = 15;
  player.sp = Math.max(player.sp - spCost, 0);

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

    let foundItem = null;
    if (Math.random() < 0.6) {
      const items = await MapItem.find({ pls: player.pls });
      if (items.length) {
        foundItem = items[Math.floor(Math.random() * items.length)];
        log += `你找到了${foundItem.itm}。<br>`;
      }
    }

    await player.save();
    if (foundItem) {
      return res.json({ log, player, item: foundItem });
    }

    log += '但是没有发现任何东西。';
    res.json({ log, player });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: '搜索失败' });
  }
};

exports.pickItem = async (req, res) => {
  try {
    const { pid, iid } = req.body;
    const player = await Player.findOne({ pid, uid: req.user._id });
    if (!player) return res.status(404).json({ msg: '玩家不存在' });
    const item = await MapItem.findOne({ _id: iid, pls: player.pls });
    if (!item) return res.status(404).json({ msg: '物品不存在' });
    let slot = -1;
    for (let i = 0; i < 5; i++) {
      if (!player[`itm${i}`]) {
        slot = i;
        break;
      }
    }
    if (slot === -1) return res.status(400).json({ msg: '背包已满' });
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

exports.useItem = async (req, res) => {
  try {
    const { pid, index } = req.body;
    const player = await Player.findOne({ pid, uid: req.user._id });
    if (!player) return res.status(404).json({ msg: '玩家不存在' });
    if (index < 0 || index >= 5) return res.status(400).json({ msg: '物品编号错误' });
    const name = player[`itm${index}`];
    if (!name) return res.status(400).json({ msg: '物品不存在' });
    // 简易效果：使用后恢复少量生命并删除
    player.hp = Math.min(player.mhp, player.hp + 10);
    player[`itm${index}`] = '';
    player[`itmk${index}`] = '';
    player[`itme${index}`] = 0;
    player[`itms${index}`] = '0';
    player[`itmsk${index}`] = '';
    await player.save();
    res.json({ msg: `使用了${name}`, player });
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

    if (kind.startsWith('W')) {
      player.wep = name;
      player.wepk = kind;
      player.wepe = player[`itme${index}`];
      player.weps = player[`itms${index}`];
      player.wepsk = player[`itmsk${index}`];
    } else if (kind.startsWith('DB')) {
      player.arb = name;
      player.arbk = kind;
      player.arbe = player[`itme${index}`];
      player.arbs = player[`itms${index}`];
      player.arbsk = player[`itmsk${index}`];
    } else if (kind.startsWith('DH')) {
      player.arh = name;
      player.arhk = kind;
      player.arhe = player[`itme${index}`];
      player.arhs = player[`itms${index}`];
      player.arhsk = player[`itmsk${index}`];
    } else if (kind.startsWith('DA')) {
      player.ara = name;
      player.arak = kind;
      player.arae = player[`itme${index}`];
      player.aras = player[`itms${index}`];
      player.arask = player[`itmsk${index}`];
    } else if (kind.startsWith('DF')) {
      player.arf = name;
      player.arfk = kind;
      player.arfe = player[`itme${index}`];
      player.arfs = player[`itms${index}`];
      player.arfsk = player[`itmsk${index}`];
    } else if (kind.startsWith('A')) {
      player.art = name;
      player.artk = kind;
      player.arte = player[`itme${index}`];
      player.arts = player[`itms${index}`];
      player.artsk = player[`itmsk${index}`];
    } else {
      return res.status(400).json({ msg: '无法装备该物品' });
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
