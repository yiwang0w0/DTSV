const mongoose = require('mongoose');

const logSchema = new mongoose.Schema({
  lid: { type: Number, index: true },
  toid: { type: Number, default: 0 },
  type: { type: String, default: '' },
  time: { type: Number, default: 0 },
  log: { type: String, default: '' },
});

module.exports = mongoose.model('Log', logSchema);
