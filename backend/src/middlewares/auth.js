const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async function (req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ msg: '未登录' });
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.id);
    if (!user) return res.status(401).json({ msg: '无效令牌' });
    req.user = user;
    next();
  } catch (err) {
    console.error(err);
    if (err.name === 'TokenExpiredError') {
      res.status(401).json({ msg: '令牌过期' });
    } else {
      res.status(401).json({ msg: '无效令牌' });
    }
  }
};
