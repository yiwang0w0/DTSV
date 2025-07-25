const mongoose = require('mongoose');

const mapAreaSchema = new mongoose.Schema({
  pid: { type: Number, index: true, unique: true },
  name: { type: String, default: '' },
  danger: { type: Number, default: 0 },
});

module.exports = mongoose.model('MapArea', mapAreaSchema);
