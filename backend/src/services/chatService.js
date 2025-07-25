const Chat = require('../models/Chat');
const Player = require('../models/Player');

async function list(query) {
  let lastcid = Number(query.lastcid) || 0;
  const filter = lastcid ? { cid: { $gt: lastcid } } : {};
  const chats = await Chat.find(filter).sort({ cid: 1 }).limit(50);
  const newLast = chats.length ? chats[chats.length - 1].cid : lastcid;
  return { lastcid: newLast, chats };
}

async function send(user, body) {
  const { pid, msg, type = 0, recv = '' } = body;
  if (!msg) {
    const err = new Error('消息不能为空');
    err.status = 400;
    throw err;
  }
  const player = await Player.findOne({ pid, uid: user._id });
  if (!player) {
    const err = new Error('玩家不存在');
    err.status = 404;
    throw err;
  }
  const last = await Chat.findOne().sort({ cid: -1 });
  const cid = last ? last.cid + 1 : 1;
  const chat = await Chat.create({
    cid,
    type,
    time: Math.floor(Date.now() / 1000),
    send: player.name,
    recv,
    msg
  });
  return chat;
}

module.exports = { list, send };
