const GameInfo = require('../models/GameInfo');
const Player = require('../models/Player');
const gameService = require('../services/gameService');

exports.getInfo = async (req, res) => {
  try {
    await gameService.checkDangerAreas();
    await gameService.checkGameOver();
    const info = await GameInfo.findOne();
    if (info) {
      const [validnum, alivenum, deathnum] = await Promise.all([
        Player.countDocuments({ type: 0 }),
        Player.countDocuments({ type: 0, hp: { $gt: 0 } }),
        Player.countDocuments({ type: 0, hp: { $lte: 0 } })
      ]);
      info.validnum = validnum;
      info.alivenum = alivenum;
      info.deathnum = deathnum;
      await info.save();
      const data = info.toObject();
      data.now = Date.now();
      res.json(data);
    } else {
      res.json({});
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: '获取游戏信息失败' });
  }
};

exports.startGame = async (req, res) => {
  try {
    const result = await gameService.startGame();
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: '启动游戏失败' });
  }
};

exports.stopGame = async (req, res) => {
  try {
    const result = await gameService.stopGame();
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: '停止游戏失败' });
  }
};

exports.mapAreas = async (req, res) => {
  try {
    const areas = await gameService.mapAreas();
    res.json(areas);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: '获取地图列表失败' });
  }
};
