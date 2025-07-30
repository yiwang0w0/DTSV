const Player = require('../models/Player');
const History = require('../models/History');
const GameInfo = require('../models/GameInfo');
const cache = require('../services/cacheService');
const gameService = require('../services/gameService');

exports.getInfo = async (req, res) => {
  try {
    await gameService.checkDangerAreas();
    await gameService.checkGameOver();
    const info = await gameService.getGameInfo();
    if (info) {
      const [validnum, alivenum] = await Promise.all([
        Player.countDocuments({ type: 0 }),
        Player.countDocuments({ type: 0, hp: { $gt: 0 } }),
      ]);
      const deathnum = validnum - alivenum;
      await GameInfo.updateOne({}, { validnum, alivenum, deathnum });
      await cache.invalidate('game:info');
      const data = { ...info, validnum, alivenum, deathnum, now: Date.now() };
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

exports.getHistory = async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const skip = parseInt(req.query.skip) || 0;
  try {
    const history = await History.find({ gid: { $gt: 0 } })
      .sort({ gid: -1 })
      .skip(skip)
      .limit(limit);
    res.json(history);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: '获取历史记录失败' });
  }
};
