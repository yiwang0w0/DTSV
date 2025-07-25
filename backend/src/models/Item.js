const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  id: { type: Number, index: true },
  name: { type: String, default: '' },
  kind: { type: String, default: '' },
  effect: { type: Number, default: 0 },
  dur: { type: String, default: '0' },
  skill: { type: String, default: '' }
});

module.exports = mongoose.model('Item', itemSchema);
