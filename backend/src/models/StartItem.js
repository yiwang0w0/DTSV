const mongoose = require('mongoose');

const startItemSchema = new mongoose.Schema({
  name: { type: String, default: '' },
  kind: { type: String, default: '' },
  effect: { type: Number, default: 0 },
  dur: { type: String, default: '1' },
  skill: { type: String, default: '' }
});

module.exports = mongoose.model('StartItem', startItemSchema);
