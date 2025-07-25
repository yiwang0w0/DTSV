const User = require('../models/User');
const bcrypt = require('bcrypt');

exports.getProfile = (req, res) => {
  const { username, avatar } = req.user;
  res.json({ username, avatar });
};

exports.updateProfile = async (req, res) => {
  try {
    const { username, oldPassword, newPassword, avatar } = req.body;
    const user = req.user;
    // change username
    if (username && username !== user.username) {
      const exists = await User.findOne({ username });
      if (exists) return res.status(400).json({ msg: '用户名已存在' });
      user.username = username;
    }
    // change password
    if (newPassword) {
      if (!oldPassword) return res.status(400).json({ msg: '需要提供旧密码' });
      const match = await bcrypt.compare(oldPassword, user.password);
      if (!match) return res.status(400).json({ msg: '旧密码错误' });
      user.password = await bcrypt.hash(newPassword, 10);
    }
    if (avatar !== undefined) {
      user.avatar = avatar;
    }
    await user.save();
    res.json({
      msg: '资料已更新',
      username: user.username,
      avatar: user.avatar,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: '更新失败' });
  }
};
