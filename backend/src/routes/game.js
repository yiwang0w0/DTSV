const express = require('express');
const router = express.Router();
const gameController = require('../controllers/gameController');
const playerController = require('../controllers/playerController');
const chatController = require('../controllers/chatController');
const auth = require('../middlewares/auth');

router.get('/info', gameController.getInfo);
router.post('/start', gameController.startGame);
router.post('/stop', gameController.stopGame);
router.get('/mapareas', gameController.mapAreas);
router.get('/history', gameController.getHistory);
router.get('/clubs', playerController.clubs);

router.post('/enter', auth, playerController.enter);
router.post('/move', auth, playerController.move);
router.post('/search', auth, playerController.search);
router.get('/status', auth, playerController.status);
router.get('/deadstatus', auth, playerController.deadStatus);
router.get('/players', auth, playerController.list);
router.post('/rest', auth, playerController.rest);
router.post('/pick', auth, playerController.pickItem);
router.post('/pickreplace', auth, playerController.pickReplace);
router.post('/pickequip', auth, playerController.pickEquip);
router.post('/use', auth, playerController.useItem);
router.post('/equip', auth, playerController.equip);
router.post('/unequip', auth, playerController.unequip);
router.post('/attack', auth, playerController.attack);
router.post('/escape', auth, playerController.escape);
router.post('/drop', auth, playerController.dropItem);
router.post('/dropequip', auth, playerController.dropEquip);
router.post('/loot', auth, playerController.lootItem);

router.get('/chat', auth, chatController.list);
router.post('/chat', auth, chatController.send);

module.exports = router;
