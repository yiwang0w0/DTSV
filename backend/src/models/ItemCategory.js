const mongoose = require('mongoose');

const itemEntrySchema = new mongoose.Schema(
  {
    itemId: { type: Number, required: true },
    pls: { type: Number, default: 0 },
    count: { type: Number, default: 1 },
    itmk: String,
    itme: Number,
    itms: String,
    itmsk: String,
  },
  { _id: false },
);

const itemCategorySchema = new mongoose.Schema({
  name: { type: String, default: '' },
  type: { type: String, default: 'mapitem' }, // mapitem or maptrap
  items: [itemEntrySchema],
});

module.exports = mongoose.model('ItemCategory', itemCategorySchema);
