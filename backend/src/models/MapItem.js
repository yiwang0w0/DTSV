const mongoose = require('mongoose');

const mapItemSchema = new mongoose.Schema({
  iid: { type: Number, index: true },
  itm: { type: String, default: '' },
  itmk: { type: String, default: '' },
  itme: { type: Number, default: 0 },
  itms: { type: String, default: '0' },
  itmsk: { type: String, default: '' },
  pls: { type: Number, default: 0 },
  stage: { type: String, default: 'start', index: true },
});

module.exports = mongoose.model('MapItem', mapItemSchema);
