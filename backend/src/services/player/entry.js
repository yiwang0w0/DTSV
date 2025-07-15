const Player = require('../../models/Player');
const GameInfo = require('../../models/GameInfo');
const Club = require('../../models/Club');
const { START_THRESHOLD } = require('../../config/constants');
const { checkDangerAreas } = require('../gameService');

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
      club: club || 0
    });
    user.lastgame = gid;
    user.lastpid = pid;
    await user.save();
  }

  return { pid: player.pid, pls: player.pls };
}

module.exports = { clubs, enter };
