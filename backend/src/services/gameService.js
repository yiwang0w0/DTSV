const GameInfo = require('../models/GameInfo');
const History = require('../models/History');
const MapArea = require('../models/MapArea');
const Player = require('../models/Player');
const MapItem = require('../models/MapItem');
const MapTrap = require('../models/MapTrap');
const Club = require('../models/Club');
const fs = require('fs');
const path = require('path');

async function ensureDefaultClubs() {
  const count = await Club.countDocuments();
  if (count === 0) {
    try {
      const file = path.join(__dirname, '../../../data/clubs.json');
      const clubs = JSON.parse(fs.readFileSync(file));
      if (clubs && clubs.length) {
        await Club.insertMany(clubs);
        console.log('已导入默认职业列表');
      }
    } catch (e) {
      console.error('导入默认职业列表失败', e);
    }
  }
}

async function startGame() {
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

  try {
    const file = path.join(__dirname, '../../../data/mapitems.json');
    const items = JSON.parse(fs.readFileSync(file));
    await MapItem.deleteMany({});
    if (items && items.length) {
      await MapItem.insertMany(items);
    }
  } catch (e) {
    console.error('初始化地图物品失败', e);
  }

  try {
    const file = path.join(__dirname, '../../../data/maptraps.json');
    const traps = JSON.parse(fs.readFileSync(file));
    await MapTrap.deleteMany({});
    if (traps && traps.length) {
      await MapTrap.insertMany(traps);
    }
  } catch (e) {
    console.error('初始化地图陷阱失败', e);
  }

  try {
    await Player.deleteMany({});
    await require('../models/User').updateMany({}, { lastgame: 0, lastpid: 0 });
  } catch (e) {
    console.error('清理旧玩家数据失败', e);
  }

  return { msg: '游戏已开始', gamestate: info.gamestate };
}

async function stopGame() {
  let info = await GameInfo.findOne();
  if (!info) {
    info = await GameInfo.create({ version: '1.0', gamestate: 0 });
  } else {
    const now = Math.floor(Date.now() / 1000);
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

  try {
    await Player.deleteMany({});
    await require('../models/User').updateMany({}, { lastgame: 0, lastpid: 0 });
  } catch (e) {
    console.error('清理玩家数据失败', e);
  }
  return { msg: '游戏已停止', gamestate: info.gamestate };
}

async function mapAreas() {
  const areas = await MapArea.find({}, 'pid name').sort({ pid: 1 });
  return areas.map(a => a.name);
}

module.exports = {
  ensureDefaultClubs,
  startGame,
  stopGame,
  mapAreas
};
