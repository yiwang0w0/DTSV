const Player = require('../../models/Player');
const CraftRecipe = require('../../models/CraftRecipe');
const { formatPlayer } = require('./utils');

async function craft(user, body) {
  const { pid, itemIndices } = body; // 选中的物品索引数组

  if (!Array.isArray(itemIndices) || itemIndices.length < 2 || itemIndices.length > 5) {
    const err = new Error('请选择2-5个物品进行合成');
    err.status = 400;
    throw err;
  }

  const player = await Player.findOne({ pid, uid: user._id });
  if (!player) {
    const err = new Error('玩家不存在');
    err.status = 404;
    throw err;
  }

  if (player.hp <= 0) {
    const err = new Error('你已经死亡');
    err.status = 400;
    throw err;
  }

  const materials = [];
  const validIndices = [];
  for (const idx of itemIndices) {
    if (idx >= 0 && idx < 7) {
      const itemName = player[`itm${idx}`];
      if (itemName) {
        materials.push(itemName);
        validIndices.push(idx);
      }
    }
  }

  if (materials.length < 2) {
    const err = new Error('有效物品不足，无法合成');
    err.status = 400;
    throw err;
  }

  const materialHash = CraftRecipe.generateHash(materials);
  const recipe = await CraftRecipe.findOne({ materialHash });
  if (!recipe) {
    const err = new Error('没有找到对应的合成配方');
    err.status = 400;
    throw err;
  }

  let emptySlot = -1;
  for (let i = 0; i < 7; i++) {
    if (!player[`itm${i}`]) {
      emptySlot = i;
      break;
    }
  }
  if (emptySlot === -1) {
    emptySlot = validIndices[0];
  }

  for (const idx of validIndices) {
    player[`itm${idx}`] = '';
    player[`itmk${idx}`] = '';
    player[`itme${idx}`] = 0;
    player[`itms${idx}`] = '0';
    player[`itmsk${idx}`] = '';
  }

  player[`itm${emptySlot}`] = recipe.result.name;
  player[`itmk${emptySlot}`] = recipe.result.kind;
  player[`itme${emptySlot}`] = recipe.result.effect;
  player[`itms${emptySlot}`] = recipe.result.dur;
  player[`itmsk${emptySlot}`] = recipe.result.skill;

  await player.save();
  return {
    success: true,
    message: `合成成功！获得了${recipe.result.name}`,
    result: recipe.result,
    player: formatPlayer(player),
  };
}

module.exports = { craft };
