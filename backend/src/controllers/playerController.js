const Player = require('../models/Player');
const MapItem = require('../models/MapItem');
const MapTrap = require('../models/MapTrap');
const { plsinfo } = require('../config/map');

exports.enter = async (req, res) => {
  try {
    const last = await Player.findOne().sort({ pid: -1 });
    const pid = last ? last.pid + 1 : 1;
    const player = await Player.create({
      pid,
      name: req.user.username,
      pls: 0,
      hp: 100,
      mhp: 100,
      sp: 100,
      msp: 100
    });
    res.json({ pid: player.pid, pls: player.pls });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: '进入游戏失败' });
  }
};

exports.move = async (req, res) => {
  try {
    const { pid, pls } = req.body;
    const player = await Player.findOne({ pid });
    if (!player) return res.status(404).json({ msg: '玩家不存在' });
    player.pls = pls;
    await player.save();
    res.json({ msg: `移动到${plsinfo[pls]}`, player });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: '移动失败' });
  }
};

exports.search = async (req, res) => {
  try {
    const { pid } = req.body;
    const player = await Player.findOne({ pid });
    if (!player) return res.status(404).json({ msg: '玩家不存在' });

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

    const item = await MapItem.findOne({ pls: player.pls });
    if (item) {
      for (let i = 0; i <= 6; i++) {
        if (!player[`itm${i}`]) {
          player[`itm${i}`] = item.itm;
          player[`itmk${i}`] = item.itmk;
          player[`itme${i}`] = item.itme;
          player[`itms${i}`] = item.itms;
          player[`itmsk${i}`] = item.itmsk;
          await MapItem.deleteOne({ _id: item._id });
          log += `你找到了${item.itm}。<br>`;
          break;
        }
      }
      await player.save();
      return res.json({ log, player });
    }

    log += '但是没有发现任何东西。';
    await player.save();
    res.json({ log, player });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: '搜索失败' });
  }
};

exports.status = async (req, res) => {
  try {
    const { pid } = req.query;
    const player = await Player.findOne({ pid });
    if (!player) return res.status(404).json({ msg: '玩家不存在' });
    res.json(player);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: '获取状态失败' });
  }
};
