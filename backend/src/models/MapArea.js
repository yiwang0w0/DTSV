const mongoose = require('mongoose');

const mapAreaSchema = new mongoose.Schema({
  pid: { type: Number, index: true, unique: true },
  name: { type: String, default: '' },
  danger: { type: Number, default: 0 },
  xy: { type: String, default: '' },
  info: { type: String, default: '' }
});

module.exports = mongoose.model('MapArea', mapAreaSchema);
