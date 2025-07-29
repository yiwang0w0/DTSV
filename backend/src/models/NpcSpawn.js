const mongoose = require('mongoose');

const npcSpawnSchema = new mongoose.Schema({
  area: { type: Number, index: true },
  type: { type: Number, default: 1 },
  sub: { type: Number, default: 0 },
  num: { type: Number, default: 1 },
  stage: { type: String, default: 'start', index: true },
});

module.exports = mongoose.model('NpcSpawn', npcSpawnSchema);
