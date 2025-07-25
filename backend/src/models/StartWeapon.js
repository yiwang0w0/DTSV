const mongoose = require('mongoose');

const startWeaponSchema = new mongoose.Schema({
  name: { type: String, default: '' },
  kind: { type: String, default: '' },
  effect: { type: Number, default: 0 },
  dur: { type: String, default: '1' },
  skill: { type: String, default: '' }
});

module.exports = mongoose.model('StartWeapon', startWeaponSchema);
