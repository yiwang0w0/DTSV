const mongoose = require('mongoose');

const gameInfoSchema = new mongoose.Schema({
  version: { type: String, default: '1.0.1' },
  gamenum: { type: Number, default: 0 },
  gametype: { type: Number, default: 0 },
  gamestate: { type: Number, default: 0 },
  groomid: { type: Number, default: 0 },
  groomtype: { type: Number, default: 0 },
  groomstatus: { type: Number, default: 0 },
  starttime: { type: Number, default: 0 },
  afktime: { type: Number, default: 0 },
  validnum: { type: Number, default: 0 },
  alivenum: { type: Number, default: 0 },
  deathnum: { type: Number, default: 0 },
  combonum: { type: Number, default: 0 },
  weather: { type: Number, default: 0 },
  hack: { type: Number, default: 0 },
  hdamage: { type: Number, default: 0 },
  hplayer: { type: String, default: '' },
  winmode: { type: Number, default: 0 },
  winner: { type: String, default: '' },
  areanum: { type: Number, default: 0 },
  areatime: { type: Number, default: 0 },
  areawarn: { type: Number, default: 0 },
  arealist: { type: String, default: '' },
  noisevars: { type: String, default: '' },
  roomvars: { type: String, default: '' },
  gamevars: { type: String, default: '' },
});

module.exports = mongoose.model('GameInfo', gameInfoSchema);
