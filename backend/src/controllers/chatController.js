const chatService = require('../services/chatService');

async function handle(fn, req, res, successStatus = 200) {
  try {
    const data = await fn();
    res.status(successStatus).json(data);
  } catch (err) {
    if (!err.status || err.status >= 500) {
      console.error(err);
    }
    res.status(err.status || 500).json({ msg: err.message || '操作失败' });
  }
}

exports.list = (req, res) => {
  handle(() => chatService.list(req.query), req, res);
};

exports.send = (req, res) => {
  handle(() => chatService.send(req.user, req.body), req, res, 201);
};
