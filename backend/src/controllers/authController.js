const User = require('../models/User');
const Player = require('../models/Player');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

function signAccessToken(id) {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES || '1h',
  });
}

function signRefreshToken(id) {
  return jwt.sign({ id }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES || '7d',
  });
}

exports.register = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ msg: '用户名和密码不能为空' });
    }
    const exists = await User.findOne({ username });
    if (exists) {
      return res.status(400).json({ msg: '用户名已存在' });
    }
    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ username, password: hashed });
    const token = signAccessToken(user._id);
    const refreshToken = signRefreshToken(user._id);
    user.refreshToken = refreshToken;
    await user.save();
    res.json({
      token,
      refreshToken,
      userId: user._id,
      username: user.username,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: '注册失败' });
  }
};

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ msg: '用户不存在' });
    }
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(400).json({ msg: '密码错误' });
    }
    const token = signAccessToken(user._id);
    const refreshToken = signRefreshToken(user._id);
    user.refreshToken = refreshToken;
    await user.save();
    res.json({
      token,
      refreshToken,
      userId: user._id,
      username: user.username,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: '登录失败' });
  }
};

exports.refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ msg: '缺少刷新令牌' });
    }
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(payload.id);
    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({ msg: '刷新令牌无效' });
    }
    const token = signAccessToken(user._id);
    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(401).json({ msg: '刷新失败' });
  }
};

exports.logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    let uid = null;
    if (refreshToken) {
      try {
        const payload = jwt.verify(
          refreshToken,
          process.env.JWT_REFRESH_SECRET,
        );
        uid = payload.id;
        await User.findByIdAndUpdate(uid, { refreshToken: '' });
      } catch (e) {
        // ignore invalid token
      }
    }
    if (uid) {
      const user = await User.findById(uid);
      if (user && user.lastpid) {
        await Player.updateOne(
          { pid: user.lastpid, uid },
          { $set: { state: 0 } },
        );
      }
    }
    res.json({ msg: '已退出' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: '退出失败' });
  }
};
