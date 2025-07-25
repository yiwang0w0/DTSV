const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const checkAdmin = require('../middlewares/admin');
const fieldsMeta = require('../fieldsMeta');
const gameService = require('../services/gameService');

const models = {
  players: require('../models/Player'),
  npcs: require('../models/Player'),
  shopitems: require('../models/ShopItem'),
  items: require('../models/Item'),
  logs: require('../models/Log'),
  chats: require('../models/Chat'),
  mapitems: require('../models/MapItem'),
  maptraps: require('../models/MapTrap'),
  itemcategories: require('../models/ItemCategory'),
  itemrefreshes: require('../models/ItemRefresh'),
  mapareas: require('../models/MapArea'),
  newsinfos: require('../models/NewsInfo'),
  roomlisteners: require('../models/RoomListener'),
  histories: require('../models/History'),
  gameinfos: require('../models/GameInfo'),
  users: require('../models/User'),
};

router.use(auth);
router.use(checkAdmin);

router.get('/maps/fieldmeta', (req, res) => {
  const meta = fieldsMeta['maps'] || [];
  res.json(meta);
});

router.get('/maps', async (req, res) => {
  try {
    const [players, areas] = await Promise.all([
      models.players.find({}, 'pid name pls'),
      models.mapareas.find({}, 'pid name'),
    ]);
    const nameMap = {};
    areas.forEach((a) => {
      nameMap[a.pid] = a.name;
    });
    const grouped = {};
    players.forEach((p) => {
      if (!grouped[p.pls])
        grouped[p.pls] = {
          pls: p.pls,
          name: nameMap[p.pls] || '',
          players: [],
        };
      grouped[p.pls].players.push({ pid: p.pid, name: p.name });
    });
    res.json(Object.values(grouped));
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: '获取失败' });
  }
});

router.post('/mapareas/:pid/open', async (req, res) => {
  const pid = Number(req.params.pid);
  try {
    await gameService.openArea(pid);
    res.json({ msg: '已开启禁区' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: '操作失败' });
  }
});

router.post('/mapareas/:pid/close', async (req, res) => {
  const pid = Number(req.params.pid);
  try {
    await gameService.closeArea(pid);
    res.json({ msg: '已关闭禁区' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: '操作失败' });
  }
});

function getModel(name) {
  return models[name];
}

router.get('/:collection/fieldmeta', (req, res) => {
  const meta = fieldsMeta[req.params.collection] || [];
  res.json(meta);
});

router.get('/:collection', async (req, res) => {
  const Model = getModel(req.params.collection);
  if (!Model) return res.status(404).json({ msg: '集合不存在' });
  try {
    const filter = {};
    if (req.params.collection === 'mapitems' && req.query.pls !== undefined) {
      filter.pls = Number(req.query.pls);
    }
    if (req.params.collection === 'players') {
      filter.type = 0;
    }
    if (req.params.collection === 'npcs') {
      filter.type = { $gt: 0 };
    }
    if (req.params.collection === 'items' && req.query.kind) {
      filter.kind = req.query.kind;
    }
    const skip = Number(req.query.skip) || 0;
    const limit = Number(req.query.limit) || 100;
    const docs = await Model.find(filter).skip(skip).limit(limit);
    res.json(docs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: '获取失败' });
  }
});

router.post('/:collection', async (req, res) => {
  const Model = getModel(req.params.collection);
  if (!Model) return res.status(404).json({ msg: '集合不存在' });
  try {
    const data = { ...req.body };
    if (req.params.collection === 'players') {
      data.type = 0;
    }
    if (req.params.collection === 'npcs') {
      if (!data.type || data.type === 0) data.type = 1;
    }
    const doc = await Model.create(data);
    res.json(doc);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: '创建失败' });
  }
});

router.put('/:collection/:id', async (req, res) => {
  const Model = getModel(req.params.collection);
  if (!Model) return res.status(404).json({ msg: '集合不存在' });
  try {
    const doc = await Model.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    res.json(doc);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: '更新失败' });
  }
});

router.delete('/:collection/:id', async (req, res) => {
  const Model = getModel(req.params.collection);
  if (!Model) return res.status(404).json({ msg: '集合不存在' });
  try {
    await Model.findByIdAndDelete(req.params.id);
    res.json({ msg: '已删除' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: '删除失败' });
  }
});

module.exports = router;
