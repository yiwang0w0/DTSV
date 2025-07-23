const GameInfo = require('../models/GameInfo');
const History = require('../models/History');
const MapArea = require('../models/MapArea');
const Player = require('../models/Player');
const MapItem = require('../models/MapItem');
const MapTrap = require('../models/MapTrap');
const Club = require('../models/Club');
const { AREA_INTERVAL, AREA_ADD, START_THRESHOLD } = require('../config/constants');
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

  try {
    const npcFile = path.join(__dirname, '../../../data/npcs.json');
    const npcs = JSON.parse(fs.readFileSync(npcFile));
    await Player.deleteMany({ type: { $gt: 0 } });
    if (npcs && npcs.length) {
      await Player.insertMany(npcs);
    }
  } catch (e) {
    console.error('初始化 NPC 失败', e);
  }

  const areas = await MapArea.find({}, 'pid');
  const ids = areas.map(a => a.pid);
  for (const id of ids) {
    await MapArea.updateOne({ pid: id }, { danger: 0 });
  }
  ids.sort(() => Math.random() - 0.5);
  info.arealist = ids.join(',');
  info.areanum = 0;
  info.areatime = now + AREA_INTERVAL;
  await info.save();

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
  const areas = await MapArea.find({ danger: 0 }, 'pid name').sort({ pid: 1 });
  return areas.map(a => a.name);
}

async function checkDangerAreas() {
  const info = await GameInfo.findOne();
  if (!info || info.gamestate < START_THRESHOLD) return;
  const now = Math.floor(Date.now() / 1000);
  if (!info.areatime) {
    info.areatime = info.starttime + AREA_INTERVAL;
  }
  const all = info.arealist ? info.arealist.split(',').map(Number) : [];
  const total = all.length;
  let changed = false;
  while (info.areanum < total && now >= info.areatime) {
    const next = all.slice(info.areanum, info.areanum + AREA_ADD);
    info.areanum += next.length;
    info.areatime += AREA_INTERVAL;
    changed = true;
    for (const pid of next) {
      await MapArea.updateOne({ pid }, { danger: 1 });
      const players = await Player.find({ pls: pid, hp: { $gt: 0 } });
      for (const p of players) {
        p.hp = 0;
        p.state = 11;
        p.endtime = now;
        await p.save();
      }
    }
  }
  if (changed) {
    await info.save();
  }
}

async function checkGameOver() {
  const info = await GameInfo.findOne();
  if (!info || info.gamestate < START_THRESHOLD) return;
  const alive = await Player.countDocuments({ type: 0, hp: { $gt: 0 } });
  if (alive > 0) return;
  await stopGame();
}

async function openArea(pid) {
  await MapArea.updateOne({ pid }, { danger: 1 });
  const info = await GameInfo.findOne();
  if (info) {
    info.areanum = await MapArea.countDocuments({ danger: 1 });
    await info.save();
  }
}

async function closeArea(pid) {
  await MapArea.updateOne({ pid }, { danger: 0 });
  const info = await GameInfo.findOne();
  if (info) {
    info.areanum = await MapArea.countDocuments({ danger: 1 });
    await info.save();
  }
}

module.exports = {
  ensureDefaultClubs,
  startGame,
  stopGame,
  mapAreas,
  checkDangerAreas,
  checkGameOver,
  openArea,
  closeArea
};
