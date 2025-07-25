const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
  cid: { type: Number, index: true },
  type: { type: Number, default: 0 },
  time: { type: Number, default: 0 },
  send: { type: String, default: '' },
  recv: { type: String, default: '' },
  msg: { type: String, default: '' },
});

module.exports = mongoose.model('Chat', chatSchema);
