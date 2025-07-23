const Player = require('../../models/Player');
const GameInfo = require('../../models/GameInfo');
const Club = require('../../models/Club');
const fs = require('fs');
const path = require('path');
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

    try {
      // 数据目录位于项目根目录的 /data，需从当前文件向上返回四级
      const itemFile = path.join(
        __dirname,
        '../../../../data/start_items.json'
      );
      const wepFile = path.join(
        __dirname,
        '../../../../data/start_weapons.json'
      );
      const startItems = JSON.parse(fs.readFileSync(itemFile));
      const startWeps = JSON.parse(fs.readFileSync(wepFile));

      const pick = arr => arr[Math.floor(Math.random() * arr.length)];

      player.itm1 = '面包';
      player.itmk1 = 'HH';
      player.itme1 = 100;
      player.itms1 = '30';
      player.itmsk1 = '';

      player.itm2 = '矿泉水';
      player.itmk2 = 'HS';
      player.itme2 = 100;
      player.itms2 = '30';
      player.itmsk2 = '';

      if (startWeps.length) {
        const w = pick(startWeps);
        player.wep = w.name;
        player.wepk = w.kind;
        player.wepe = Number(w.effect);
        player.weps = String(w.dur);
        player.wepsk = w.skill;
      }

      if (startItems.length) {
        const it1 = pick(startItems);
        player.itm3 = it1.name;
        player.itmk3 = it1.kind;
        player.itme3 = Number(it1.effect);
        player.itms3 = String(it1.dur);
        player.itmsk3 = it1.skill;

        let it2;
        do {
          it2 = pick(startItems);
        } while (startItems.length > 1 && it2.kind === it1.kind);
        player.itm4 = it2.name;
        player.itmk4 = it2.kind;
        player.itme4 = Number(it2.effect);
        player.itms4 = String(it2.dur);
        player.itmsk4 = it2.skill;
      }
    } catch (e) {
      console.error('初始化玩家物品失败', e);
    }

    user.lastgame = gid;
    user.lastpid = pid;
    await user.save();
    await player.save();
  }

  return { pid: player.pid, pls: player.pls };
}

module.exports = { clubs, enter };
