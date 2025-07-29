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
    stage: { type: String, default: 'start' },
  },
  { _id: false },
);

const itemCategorySchema = new mongoose.Schema({
  name: { type: String, default: '' },
  type: { type: String, default: 'mapitem' }, // mapitem or maptrap
  area: { type: Number, default: 0, index: true },
  items: [itemEntrySchema],
  // 可引用其他刷新表名称，后台可多选
  tables: { type: [String], default: [] },
});

module.exports = mongoose.model('ItemCategory', itemCategorySchema);
