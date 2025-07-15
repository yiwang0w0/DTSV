const mongoose = require('mongoose');

const clubSchema = new mongoose.Schema({
  cid: { type: Number, index: true },
  name: { type: String, default: '' },
  hp: { type: Number, default: 0 },
  sp: { type: Number, default: 0 },
  att: { type: Number, default: 0 },
  def: { type: Number, default: 0 },
  money: { type: Number, default: 0 }
});

module.exports = mongoose.model('Club', clubSchema);
