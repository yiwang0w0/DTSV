const Player = require('../../models/Player');
const GameInfo = require('../../models/GameInfo');
const Club = require('../../models/Club');
const { START_THRESHOLD } = require('../../config/constants');
const { checkDangerAreas } = require('../gameService');
const startItems = require('../../../../data/start_items.json');
const startWeapons = require('../../../../data/start_weapons.json');

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
      itm0: '面包',
      itmk0: 'HH',
      itme0: 100,
      itms0: '30',
      itmsk0: '',
      itm1: '矿泉水',
      itmk1: 'HS',
      itme1: 100,
      itms1: '30',
      itmsk1: ''
    });

    const weapon =
      startWeapons[Math.floor(Math.random() * startWeapons.length)] || null;
    if (weapon) {
      player.wep = weapon.itm;
      player.wepk = weapon.itmk;
      player.wepe = weapon.itme;
      player.weps = String(weapon.itms);
      player.wepsk = weapon.itmsk || '';
    }

    function randItem() {
      return startItems[Math.floor(Math.random() * startItems.length)];
    }
    let itemA = randItem();
    let itemB = randItem();
    let limit = 10;
    while (itemB.itmk === itemA.itmk && limit > 0) {
      itemB = randItem();
      limit--;
    }

    if (itemA) {
      player.itm2 = itemA.itm;
      player.itmk2 = itemA.itmk;
      player.itme2 = itemA.itme;
      player.itms2 = String(itemA.itms);
      player.itmsk2 = itemA.itmsk || '';
    }
    if (itemB) {
      player.itm3 = itemB.itm;
      player.itmk3 = itemB.itmk;
      player.itme3 = itemB.itme;
      player.itms3 = String(itemB.itms);
      player.itmsk3 = itemB.itmsk || '';
    }

    await player.save();
    user.lastgame = gid;
    user.lastpid = pid;
    await user.save();
  }

  return { pid: player.pid, pls: player.pls };
}

module.exports = { clubs, enter };
