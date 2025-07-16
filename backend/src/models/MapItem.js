const mongoose = require('mongoose');

const mapItemSchema = new mongoose.Schema({
  iid: { type: Number, index: true },
  time: { type: Number, default: 0 },
  itm: { type: String, default: '' },
  itmk: { type: String, default: '' },
  itme: { type: Number, default: 0 },
  itms: { type: String, default: '0' },
  itmsk: { type: String, default: '' },
  pls: { type: Number, default: 0 }
});

module.exports = mongoose.model('MapItem', mapItemSchema);
