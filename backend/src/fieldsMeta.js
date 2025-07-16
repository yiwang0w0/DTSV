module.exports = {
  players: [
    { name: 'pid', label: '玩家ID', type: 'number' },
    { name: 'name', label: '昵称', type: 'text' },
    { name: 'hp', label: '生命值', type: 'number' },
    { name: 'sp', label: '体力', type: 'number' },
    { name: 'pls', label: '所在区域', type: 'number' },
    { name: 'money', label: '金钱', type: 'number' },
    { name: 'state', label: '状态', type: 'number' }
  ],
  shopitems: [
    { name: 'sid', label: '物品ID', type: 'number' },
    { name: 'item', label: '名称', type: 'text' },
    { name: 'price', label: '价格', type: 'number' },
    { name: 'area', label: '地区', type: 'number' }
  ],
  users: [
    { name: 'username', label: '用户名', type: 'text' },
    { name: 'role', label: '角色', type: 'select', options: ['user','admin'] }
  ],
  logs: [
  { name: 'lid', label: '日志ID', type: 'number' },
  { name: 'time', label: '时间戳', type: 'number' },
  { name: 'log', label: '日志内容', type: 'text' }
],
chats: [
  { name: 'cid', label: '聊天ID', type: 'number' },
  { name: 'type', label: '频道', type: 'select', options: ['0','1','2','3'] },
  { name: 'name', label: '发送者', type: 'text' },
  { name: 'msg', label: '内容', type: 'text' },
  { name: 'time', label: '时间戳', type: 'number' }
],
mapitems: [
  { name: 'itm', label: '道具名', type: 'text' },
  { name: 'itmk', label: '种类', type: 'text' },
  { name: 'itme', label: '效果值', type: 'number' },
  { name: 'itms', label: '次数/耐久', type: 'text' },
  { name: 'itmsk', label: '属性', type: 'text' },
  { name: 'pls', label: '所在区域', type: 'number' }
],
maptraps: [
  { name: 'itm', label: '陷阱名', type: 'text' },
  { name: 'itmk', label: '类型', type: 'text' },
  { name: 'itme', label: '伤害', type: 'number' },
  { name: 'itms', label: '用途/次数', type: 'text' },
  { name: 'pls', label: '布设区域', type: 'number' },
  { name: 'time', label: '出现时间', type: 'number' }
],
  mapareas: [
    { name: 'pid', label: '区域ID', type: 'number' },
    { name: 'name', label: '区域名', type: 'text' },
    { name: 'danger', label: '危险度', type: 'number' }
  ],
newsinfos: [
  { name: 'nid', label: '新闻ID', type: 'number' },
  { name: 'news', label: '内容', type: 'text' },
  { name: 'time', label: '时间戳', type: 'number' }
],
roomlisteners: [
  { name: 'port', label: '端口', type: 'number' },
  { name: 'status', label: '状态', type: 'select', options: ['监听中','已关闭'] }
],
histories: [
  { name: 'gid', label: '游戏ID', type: 'number' },
  { name: 'winner', label: '胜利者', type: 'text' },
  { name: 'winmode', label: '胜利方式', type: 'number' },
  { name: 'endtime', label: '结束时间戳', type: 'number' }
],
gameinfos: [
  { name: 'version', label: '版本', type: 'text' },
  { name: 'gamenum', label: '局数', type: 'number' },
  { name: 'gametype', label: '模式', type: 'number' },
  { name: 'gamestate', label: '状态', type: 'select', options: ['未开始', '进行中', '已结束'] },
  { name: 'groomid', label: '房间ID', type: 'number' },
  { name: 'groomtype', label: '房间类型', type: 'number' },
  { name: 'groomstatus', label: '房间状态', type: 'number' },
  { name: 'starttime', label: '开始时间', type: 'number' },
  { name: 'afktime', label: '离线时间', type: 'number' },
  { name: 'validnum', label: '有效人数', type: 'number' },
  { name: 'alivenum', label: '存活人数', type: 'number' },
  { name: 'deathnum', label: '死亡数', type: 'number' },
  { name: 'combonum', label: '连杀数', type: 'number' },
  { name: 'weather', label: '天气', type: 'number' },
  { name: 'hack', label: '禁区解除', type: 'number' },
  { name: 'hdamage', label: '最高伤害', type: 'number' },
  { name: 'hplayer', label: '伤害玩家', type: 'text' },
  { name: 'winmode', label: '胜利模式', type: 'number' },
  { name: 'winner', label: '胜利者', type: 'text' },
  { name: 'areanum', label: '已有禁区数', type: 'number' },
  { name: 'areatime', label: '禁区时间', type: 'number' },
  { name: 'areawarn', label: '禁区警告', type: 'number' },
  { name: 'arealist', label: '禁区列表', type: 'text' },
  { name: 'noisevars', label: '噪音参数', type: 'text' },
  { name: 'roomvars', label: '房间变量', type: 'text' },
  { name: 'gamevars', label: '游戏变量', type: 'text' }
],
  maps: [
    { name: 'pls', label: '区域ID', type: 'number' },
    { name: 'name', label: '区域名', type: 'text' },
    { name: 'players', label: '玩家列表', type: 'text' }
  ],



}
