const GameInfo = require('../models/GameInfo');
const History = require('../models/History');
const MapArea = require('../models/MapArea');
const Player = require('../models/Player');
const MapItem = require('../models/MapItem');
const MapTrap = require('../models/MapTrap');
const Item = require('../models/Item');
const ItemCategory = require('../models/ItemCategory');
const Club = require('../models/Club');
const Chat = require('../models/Chat');
const constants = require('../config/constants');
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

async function ensureGameInfo() {
  const count = await GameInfo.countDocuments();
  if (count === 0) {
    await GameInfo.create({});
    console.log('已初始化游戏信息');
  }
}

async function generateItemsFromCategories(type, stage = 'start') {
  const categories = await ItemCategory.find({ type });
  const map = {};
  categories.forEach((c) => {
    map[c.name] = c;
  });
  const res = [];
  let id = 1;
  const visited = new Set();

  function process(cat) {
    if (!cat || visited.has(cat.name)) return;
    visited.add(cat.name);
    for (const e of cat.items || []) {
      if (e.stage && e.stage !== stage) continue;
      const base = Item.findOne({ id: e.itemId });
      promises.push(base.then((b) => {
        if (!b) return;
        const cnt = e.count || 1;
        for (let i = 0; i < cnt; i++) {
          const obj = {
            itm: b.name,
            itmk: e.itmk || b.kind,
            itme: e.itme !== undefined ? e.itme : b.effect,
            itms: e.itms !== undefined ? e.itms : b.dur,
            itmsk: e.itmsk || b.skill,
            pls: e.pls || 0,
          };
          if (type === 'mapitem') obj.iid = id++;
          else obj.tid = id++;
          res.push(obj);
        }
      }));
    }
    (cat.tables || []).forEach((n) => process(map[n]));
  }

  const promises = [];
  categories.forEach(process);
  await Promise.all(promises);
  return res;
}

async function spawnMapItems(stage) {
  let items = await generateItemsFromCategories('mapitem', stage);
  if (!items.length) {
    try {
      const fp = path.join(__dirname, '../data/mapitems.json');
      if (fs.existsSync(fp)) {
        const raw = JSON.parse(fs.readFileSync(fp));
        items = raw.filter((it) => it.stage === stage);
      }
    } catch (e) {
      console.error('读取默认地图物品失败', e);
    }
  }
  if (items.length) {
    let id = 1;
    items = items.map((it) => ({ ...it, iid: id++, stage: it.stage || stage }));
    await MapItem.insertMany(items);
  }
}

async function spawnMapTraps(stage) {
  const traps = await generateItemsFromCategories('maptrap', stage);
  if (traps.length) await MapTrap.insertMany(traps);
}

async function startGame() {
  let info = await GameInfo.findOne();
  const now = Math.floor(Date.now() / 1000);
  if (!info) {
    info = await GameInfo.create({
      version: '1.0.1',
      gamenum: 1,
      gamestate: 20,
      starttime: now,
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
    await Chat.deleteMany({});
    await MapItem.deleteMany({});
    const count = await ItemCategory.countDocuments({ type: 'mapitem' });
    if (count > 0) {
      await spawnMapItems('start');
    } else {
      const file = path.join(__dirname, '../../../data/mapitems.json');
      const items = JSON.parse(fs.readFileSync(file));
      if (items && items.length) {
        await MapItem.insertMany(items);
      }
    }
  } catch (e) {
    console.error('初始化地图物品失败', e);
  }

  try {
    await MapTrap.deleteMany({});
    const count = await ItemCategory.countDocuments({ type: 'maptrap' });
    if (count > 0) {
      await spawnMapTraps('start');
    } else {
      const file = path.join(__dirname, '../../../data/maptraps.json');
      const traps = JSON.parse(fs.readFileSync(file));
      if (traps && traps.length) {
        await MapTrap.insertMany(traps);
      }
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
      const startNpcs = npcs
        .filter((n) => !n.spawnStage || n.spawnStage === 'start')
        .map((n) => ({
          ...n,
          hp: n.hp || n.mhp || 0,
          sp: n.sp || n.msp || 0,
          ss: n.ss || n.mss || 0,
        }));
      if (startNpcs.length) {
        await Player.insertMany(startNpcs);
      }
    }
  } catch (e) {
    console.error('初始化 NPC 失败', e);
  }

  const areas = await MapArea.find({}, 'pid');
  const ids = areas.map((a) => a.pid);
  for (const id of ids) {
    await MapArea.updateOne({ pid: id }, { danger: 0 });
  }
  ids.sort(() => Math.random() - 0.5);
  info.arealist = ids.join(',');
  info.areanum = 0;
  info.areatime = now + constants.get('AREA_INTERVAL');
  await info.save();

  const last = await Chat.findOne().sort({ cid: -1 });
  const cid = last ? last.cid + 1 : 1;
  await Chat.create({
    cid,
    type: 5,
    time: now,
    send: '',
    recv: '',
    msg: '游戏开始！',
  });

  return { msg: '游戏已开始', gamestate: info.gamestate };
}

async function spawnNpcs(stage) {
  try {
    const npcFile = path.join(__dirname, '../../../data/npcs.json');
    const npcs = JSON.parse(fs.readFileSync(npcFile));
    const list = npcs
      .filter((n) => n.spawnStage === stage)
      .map((n) => ({
        ...n,
        hp: n.hp || n.mhp || 0,
        sp: n.sp || n.msp || 0,
        ss: n.ss || n.mss || 0,
      }));
    if (list.length) {
      await Player.insertMany(list);
    }
  } catch (e) {
    console.error('生成 NPC 失败', e);
  }
}

async function stopGame() {
  let info = await GameInfo.findOne();
  if (!info) {
    info = await GameInfo.create({ version: '1.0.1', gamestate: 0 });
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
        hdp: info.hplayer,
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
  const [areas, info] = await Promise.all([
    MapArea.find({}, 'pid name danger').sort({ pid: 1 }),
    GameInfo.findOne(),
  ]);
  const res = areas.map((a) => ({
    pid: a.pid,
    name: a.name,
    danger: a.danger,
  }));
  if (info && info.arealist && info.areatime) {
    const now = Math.floor(Date.now() / 1000);
    const warn = info.areatime - now <= 300;
    if (warn) {
      const ids = info.arealist.split(',').map(Number);
      const next = ids.slice(
        info.areanum,
        info.areanum + constants.get('AREA_ADD'),
      );
      for (const pid of next) {
        const area = res.find((a) => a.pid === pid);
        if (area && area.danger === 0) area.danger = 2;
      }
    }
  }
  return res;
}

async function checkDangerAreas() {
  const info = await GameInfo.findOne();
  if (!info || info.gamestate < constants.get('START_THRESHOLD')) return;
  const now = Math.floor(Date.now() / 1000);
  if (!info.areatime) {
    info.areatime = info.starttime + constants.get('AREA_INTERVAL');
  }
  const all = info.arealist ? info.arealist.split(',').map(Number) : [];
  const total = all.length;
  let changed = false;
  const before = info.areanum;
  while (info.areanum < total && now >= info.areatime) {
    const next = all.slice(
      info.areanum,
      info.areanum + constants.get('AREA_ADD'),
    );
    info.areanum += next.length;
    info.areatime += constants.get('AREA_INTERVAL');
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
    if (before < 2 && info.areanum >= 2) {
      await spawnNpcs('ban2');
      await spawnMapItems('ban2');
      await spawnMapTraps('ban2');
    }
    if (before < 4 && info.areanum >= 4) {
      await spawnNpcs('ban4');
      await spawnMapItems('ban4');
      await spawnMapTraps('ban4');
    }
  }
}

async function checkGameOver() {
  const info = await GameInfo.findOne();
  if (!info || info.gamestate < constants.get('START_THRESHOLD')) return;
  const [alive, valid] = await Promise.all([
    Player.countDocuments({ type: 0, hp: { $gt: 0 } }),
    Player.countDocuments({ type: 0 }),
  ]);
  // 尚无人进入游戏时不结束，避免刚开局就关闭
  if (valid === 0 || alive > 0) return;
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
  ensureGameInfo,
  startGame,
  stopGame,
  mapAreas,
  checkDangerAreas,
  checkGameOver,
  openArea,
  closeArea,
  spawnNpcs,
  spawnMapItems,
  spawnMapTraps,
};
