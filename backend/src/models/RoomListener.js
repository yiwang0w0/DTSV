const mongoose = require('mongoose');

const roomListenerSchema = new mongoose.Schema({
  port: { type: Number, default: 0 },
  timestamp: { type: Number, default: 0 },
  roomid: { type: Number, default: 0 },
  uniqid: { type: String, default: '' },
});

module.exports = mongoose.model('RoomListener', roomListenerSchema);
