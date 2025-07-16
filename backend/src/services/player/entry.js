const Player = require('../../models/Player');
const GameInfo = require('../../models/GameInfo');
const Club = require('../../models/Club');
const { START_THRESHOLD } = require('../../config/constants');
const { checkDangerAreas } = require('../gameService');
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '../../../data');
const startItems = JSON.parse(fs.readFileSync(path.join(dataDir, 'start_items.json')));
const startWeapons = JSON.parse(fs.readFileSync(path.join(dataDir, 'start_weapons.json')));

async function clubs() {
  const clubs = await Club.find({}, 'cid name');
  return clubs;
}

async function enter(user, body) {
  await checkDangerAreas();
  const info = await GameInfo.findOne();
  if (!info || info.gamestate < START_THRESHOLD) {
    const err = new Error('游戏未开始');
    err.status = 400;
    throw err;
  }
  const gid = info.gamenum;

  let player = null;
  if (user.lastgame === gid && user.lastpid) {
    player = await Player.findOne({ pid: user.lastpid, uid: user._id });
  }

  if (!player) {
    const last = await Player.findOne().sort({ pid: -1 });
    const pid = last ? last.pid + 1 : 1;
    const { club } = body;
    let base = { hp: 100, sp: 200, att: 0, def: 0, money: 20 };
    if (club) {
      const c = await Club.findOne({ cid: club });
      if (c) {
        base.hp += c.hp;
        base.sp += c.sp;
        base.att += c.att;
        base.def += c.def;
        base.money += c.money;
      }
    }
    const weapon = startWeapons[Math.floor(Math.random() * startWeapons.length)];
    let itemA = startItems[Math.floor(Math.random() * startItems.length)];
    let itemB;
    do {
      itemB = startItems[Math.floor(Math.random() * startItems.length)];
    } while (itemB.name === itemA.name && itemB.kind === itemA.kind);

    player = await Player.create({
      pid,
      uid: user._id,
      name: user.username,
      pls: 0,
      hp: base.hp,
      mhp: base.hp,
      sp: base.sp,
      msp: base.sp,
      att: base.att,
      def: base.def,
      money: base.money,
      club: club || 0,
      wep: weapon.name,
      wepk: weapon.kind,
      wepe: weapon.effect,
      weps: String(weapon.dur),
      wepsk: weapon.skill || '',
      itm1: '面包',
      itmk1: 'HH',
      itme1: 100,
      itms1: '30',
      itm2: '矿泉水',
      itmk2: 'HS',
      itme2: 100,
      itms2: '30',
      itm3: itemA.name,
      itmk3: itemA.kind,
      itme3: itemA.effect,
      itms3: String(itemA.dur),
      itmsk3: itemA.skill || '',
      itm4: itemB.name,
      itmk4: itemB.kind,
      itme4: itemB.effect,
      itms4: String(itemB.dur),
      itmsk4: itemB.skill || ''
    });
    user.lastgame = gid;
    user.lastpid = pid;
    await user.save();
  }

  return { pid: player.pid, pls: player.pls };
}

module.exports = { clubs, enter };
