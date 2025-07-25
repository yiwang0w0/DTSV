const mongoose = require('mongoose');

const shopItemSchema = new mongoose.Schema({
  sid: { type: Number, index: true },
  kind: { type: Number, default: 0 },
  num: { type: Number, default: 0 },
  price: { type: Number, default: 0 },
  area: { type: Number, default: 0 },
  item: { type: String, default: '' },
  itmk: { type: String, default: '' },
  itme: { type: Number, default: 0 },
  itms: { type: String, default: '0' },
  itmsk: { type: String, default: '' },
});

module.exports = mongoose.model('ShopItem', shopItemSchema);
