const mongoose = require('mongoose');

const craftRecipeSchema = new mongoose.Schema({
  materials: [{ type: String, required: true }], // 材料名称数组，已排序
  materialHash: { type: String, unique: true, index: true }, // 材料组合的哈希值
  result: {
    name: { type: String, required: true },
    kind: { type: String, required: true },
    effect: { type: Number, default: 0 },
    dur: { type: String, default: '1' },
    skill: { type: String, default: '' },
  },
});

// 生成材料组合的哈希值
craftRecipeSchema.statics.generateHash = function generateHash(materials) {
  return materials.sort().join('|');
};

module.exports = mongoose.model('CraftRecipe', craftRecipeSchema);
