const mongoose = require('mongoose');
const Player = require('./Player');

module.exports = mongoose.model('Npc', Player.schema, 'npcs');
