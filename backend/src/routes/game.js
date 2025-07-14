const express = require('express');
const router = express.Router();
const gameController = require('../controllers/gameController');
const playerController = require('../controllers/playerController');
const auth = require('../middlewares/auth');

router.get('/info', gameController.getInfo);
router.post('/start', gameController.startGame);
router.post('/stop', gameController.stopGame);
router.get('/mapareas', gameController.mapAreas);

router.post('/enter', auth, playerController.enter);
router.post('/move', auth, playerController.move);
router.post('/search', auth, playerController.search);
router.get('/status', auth, playerController.status);
router.get('/players', auth, playerController.list);

module.exports = router;
