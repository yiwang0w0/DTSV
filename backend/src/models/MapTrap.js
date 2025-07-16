const mongoose = require('mongoose');

const mapTrapSchema = new mongoose.Schema({
  tid: { type: Number, index: true },
  itm: { type: String, default: '' },
  itmk: { type: String, default: '' },
  itme: { type: Number, default: 0 },
  itms: { type: String, default: '0' },
  itmsk: { type: String, default: '' },
  pls: { type: Number, default: 0 }
});

module.exports = mongoose.model('MapTrap', mapTrapSchema);
