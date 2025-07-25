const mongoose = require('mongoose');

const historySchema = new mongoose.Schema({
  gid: { type: Number, index: true },
  wmode: { type: Number, default: 0 },
  winner: { type: String, default: '' },
  motto: { type: String, default: '' },
  gametype: { type: Number, default: 0 },
  vnum: { type: Number, default: 0 },
  gtime: { type: Number, default: 0 },
  gstime: { type: Number, default: 0 },
  getime: { type: Number, default: 0 },
  hdmg: { type: Number, default: 0 },
  hdp: { type: String, default: '' },
  hkill: { type: Number, default: 0 },
  hkp: { type: String, default: '' },
  winnernum: { type: Number, default: 0 },
  winnerteamID: { type: String, default: '' },
  winnerlist: { type: String, default: '' },
  winnerpdata: { type: String, default: '' },
  validlist: { type: String, default: '' },
  hnews: { type: String, default: '' },
});

module.exports = mongoose.model('History', historySchema);
