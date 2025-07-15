const playerService = require('../services/playerService');

async function handle(fn, req, res, successStatus=200) {
  try {
    const data = await fn();
    res.status(successStatus).json(data);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ msg: err.message || '操作失败' });
  }
}

exports.clubs = (req, res) => {
  handle(() => playerService.clubs(), req, res);
};

exports.enter = (req, res) => {
  handle(() => playerService.enter(req.user, req.body), req, res);
};

exports.move = (req, res) => {
  handle(() => playerService.move(req.user, req.body), req, res);
};

exports.search = (req, res) => {
  handle(() => playerService.search(req.user, req.body), req, res);
};

exports.status = (req, res) => {
  handle(() => playerService.status(req.user, req.query), req, res);
};

exports.deadStatus = (req, res) => {
  handle(() => playerService.deadStatus(req.user, req.query), req, res);
};

exports.list = (req, res) => {
  handle(() => playerService.list(req.user), req, res);
};

exports.rest = (req, res) => {
  handle(() => playerService.rest(req.user, req.body), req, res);
};

exports.pickItem = (req, res) => {
  handle(() => playerService.pickItem(req.user, req.body), req, res);
};

exports.useItem = (req, res) => {
  handle(() => playerService.useItem(req.user, req.body), req, res);
};

exports.equip = (req, res) => {
  handle(() => playerService.equip(req.user, req.body), req, res);
};

exports.unequip = (req, res) => {
  handle(() => playerService.unequip(req.user, req.body), req, res);
};

exports.pickReplace = (req, res) => {
  handle(() => playerService.pickReplace(req.user, req.body), req, res);
};

exports.pickEquip = (req, res) => {
  handle(() => playerService.pickEquip(req.user, req.body), req, res);
};
