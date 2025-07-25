const mongoose = require('mongoose');

const constantSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: mongoose.Schema.Types.Mixed,
});

module.exports = mongoose.model('Constant', constantSchema);
