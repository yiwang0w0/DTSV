const mongoose = require('mongoose');

const newsInfoSchema = new mongoose.Schema({
  nid: { type: Number, index: true },
  time: { type: Number, default: 0 },
  news: { type: String, default: '' },
  a: { type: String, default: '' },
  b: { type: String, default: '' },
  c: { type: String, default: '' },
  d: { type: String, default: '' },
  e: { type: String, default: '' },
});

module.exports = mongoose.model('NewsInfo', newsInfoSchema);
