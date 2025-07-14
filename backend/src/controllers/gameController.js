const GameInfo = require('../models/GameInfo');
const History = require('../models/History');
const MapArea = require('../models/MapArea');

exports.getInfo = async (req, res) => {
  try {
    const info = await GameInfo.findOne();
    if (info) {
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
    let info = await GameInfo.findOne();
    const now = Math.floor(Date.now() / 1000);
    if (!info) {
      info = await GameInfo.create({
        version: '1.0',
        gamenum: 1,
        gamestate: 20,
        starttime: now
      });
    } else {
      info.gamenum += 1;
      info.gamestate = 20;
      info.starttime = now;
      info.afktime = 0;
      info.validnum = 0;
      info.alivenum = 0;
      info.deathnum = 0;
      info.combonum = 0;
      info.areanum = 0;
      info.areatime = 0;
      info.areawarn = 0;
      await info.save();
    }
    res.json({ msg: '游戏已开始', gamestate: info.gamestate });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: '启动游戏失败' });
  }
};

exports.stopGame = async (req, res) => {
  try {
    let info = await GameInfo.findOne();
    if (!info) {
      info = await GameInfo.create({ version: '1.0', gamestate: 0 });
    } else {
      const now = Math.floor(Date.now() / 1000);
      // 若游戏正在进行，归档历史记录
      if (info.gamestate > 10 && info.starttime) {
        await History.create({
          gid: info.gamenum,
          wmode: 6,
          winner: '',
          gametype: info.gametype,
          vnum: info.validnum,
          gtime: now - info.starttime,
          gstime: info.starttime,
          getime: now,
          hdmg: info.hdamage,
          hdp: info.hplayer
        });
      }
      info.gamestate = 0;
      info.starttime = 0;
      await info.save();
    }
    res.json({ msg: '游戏已停止', gamestate: info.gamestate });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: '停止游戏失败' });
  }
};

exports.mapAreas = async (req, res) => {
  try {
    const areas = await MapArea.find({}, 'pid name').sort({ pid: 1 });
    res.json(areas.map(a => a.name));
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: '获取地图列表失败' });
  }
};
