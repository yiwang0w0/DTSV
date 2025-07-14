const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const checkAdmin = require('../middlewares/admin');
const fieldsMeta = require('../fieldsMeta');

const models = {
  players: require('../models/Player'),
  shopitems: require('../models/ShopItem'),
  logs: require('../models/Log'),
  chats: require('../models/Chat'),
  mapitems: require('../models/MapItem'),
  maptraps: require('../models/MapTrap'),
  mapareas: require('../models/MapArea'),
  newsinfos: require('../models/NewsInfo'),
  roomlisteners: require('../models/RoomListener'),
  histories: require('../models/History'),
  gameinfos: require('../models/GameInfo'),
  users: require('../models/User')
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
      models.mapareas.find({}, 'pid name')
    ]);
    const nameMap = {};
    areas.forEach(a => { nameMap[a.pid] = a.name; });
    const grouped = {};
    players.forEach(p => {
      if (!grouped[p.pls]) grouped[p.pls] = { pls: p.pls, name: nameMap[p.pls] || '' , players: [] };
      grouped[p.pls].players.push({ pid: p.pid, name: p.name });
    });
    res.json(Object.values(grouped));
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: '获取失败' });
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
    const docs = await Model.find().limit(100);
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
    const doc = await Model.create(req.body);
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
    const doc = await Model.findByIdAndUpdate(req.params.id, req.body, { new: true });
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
