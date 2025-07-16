const GameInfo = require('../models/GameInfo');
const History = require('../models/History');
const MapArea = require('../models/MapArea');
const Player = require('../models/Player');
const MapItem = require('../models/MapItem');
const MapTrap = require('../models/MapTrap');
const Club = require('../models/Club');
const fs = require('fs');
const path = require('path');
const { AREA_INTERVAL, AREA_ADD, START_THRESHOLD } = require('../config/constants');

let pendingItems = [];
let repeatItems = [];

async function dropScheduledItems(stage) {
  const toAdd = [];
  for (let i = pendingItems.length - 1; i >= 0; i--) {
    const item = pendingItems[i];
    if (item.time === stage) {
      toAdd.push(item);
      pendingItems.splice(i, 1);
    }
  }
  for (const item of repeatItems) {
    toAdd.push({ ...item });
  }
  if (toAdd.length) {
    await MapItem.insertMany(toAdd);
  }
}

let trapSchedule = null;

function loadTraps(filePath) {
  if (!trapSchedule) {
    const file = filePath || path.join(__dirname, '../../../data/maptraps.json');
    const traps = JSON.parse(fs.readFileSync(file));
    trapSchedule = {};
    traps.forEach(t => {
      const tm = typeof t.time === 'number' ? t.time : 0;
      if (!trapSchedule[tm]) trapSchedule[tm] = [];
      trapSchedule[tm].push(t);
    });
  }
}

async function spawnTraps(stage) {
  loadTraps();
  const list = [];
  if (trapSchedule[stage]) {
    list.push(...trapSchedule[stage]);
    delete trapSchedule[stage];
  }
  if (trapSchedule[99]) {
    list.push(...trapSchedule[99].map(t => ({ ...t })));
  }
  if (list.length) {
    await MapTrap.insertMany(list);
  }
}


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

async function startGame(gametype = 0) {
  let info = await GameInfo.findOne();
  const now = Math.floor(Date.now() / 1000);
  if (!info) {
    info = await GameInfo.create({
      version: '1.0',
      gamenum: 1,
      gamestate: 20,
      starttime: now,
      gametype
    });
  } else {
    info.gamenum += 1;
    info.gamestate = 20;
    info.starttime = now;
    info.gametype = gametype;
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

  const instMap = {
    15: 'instance5',
    16: 'instance6',
    17: 'instance7_tutorial',
    18: 'instance8_proud',
    19: 'instance9_rush'
  };

  const baseDir = path.join(__dirname, '../../../data');
  const instanceDir = instMap[gametype] ? path.join(baseDir, 'instances', instMap[gametype]) : baseDir;

  try {
    const file = fs.existsSync(path.join(instanceDir, 'mapitem.json')) ?
      path.join(instanceDir, 'mapitem.json') :
      path.join(baseDir, 'mapitems.json');
    const items = JSON.parse(fs.readFileSync(file));
    await MapItem.deleteMany({});
    pendingItems = [];
    repeatItems = [];
    if (items && items.length) {
      const startItems = items.filter(i => i.time === 0);
      pendingItems = items.filter(i => i.time > 0 && i.time !== 99);
      repeatItems = items.filter(i => i.time === 99);
      if (startItems.length) {
        await MapItem.insertMany(startItems);
      }
    }
  } catch (e) {
    console.error('初始化地图物品失败', e);
  }

  try {
    const file = fs.existsSync(path.join(instanceDir, 'trapitem.json')) ?
      path.join(instanceDir, 'trapitem.json') :
      path.join(baseDir, 'maptraps.json');
    await MapTrap.deleteMany({});
    trapSchedule = null;
    loadTraps(file);
    await spawnTraps(0);
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
    const file = fs.existsSync(path.join(instanceDir, 'npc.data.json')) ?
      path.join(instanceDir, 'npc.data.json') :
      path.join(baseDir, 'npcs.json');
    const npcs = JSON.parse(fs.readFileSync(file));
    if (npcs && npcs.length) {
      await Player.insertMany(npcs);
    }
  } catch (e) {
    console.error('初始化NPC失败', e);
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
  const areas = await MapArea.find({ danger: 0 }, 'pid name xy info').sort({ pid: 1 });
  return areas.map(a => ({ pid: a.pid, name: a.name, xy: a.xy, info: a.info }));
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
  const stage = Math.ceil(info.areanum / AREA_ADD);
  info.areatime += AREA_INTERVAL;
  changed = true;

  await spawnTraps(stage);
  await dropScheduledItems(stage);

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



module.exports = {
  ensureDefaultClubs,
  startGame,
  stopGame,
  mapAreas,
  checkDangerAreas
};
