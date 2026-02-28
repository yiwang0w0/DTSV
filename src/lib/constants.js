export const MAP_LIST = [
  { id: 0, name: '无月之影' }, { id: 1, name: '端点' }, { id: 2, name: 'RF高校' },
  { id: 3, name: '雪之镇' }, { id: 4, name: '索拉利斯' }, { id: 5, name: '指挥中心' },
  { id: 6, name: '梦幻馆' }, { id: 7, name: '清水池' }, { id: 8, name: '白穗神社' },
  { id: 9, name: '墓地' }, { id: 10, name: '麦斯克林' }, { id: 11, name: '对天使用作战本部' },
  { id: 12, name: '夏之镇' }, { id: 13, name: '三体星' }, { id: 14, name: '光坂高校' },
  { id: 15, name: '守矢神社' }, { id: 16, name: '常磐森林' }, { id: 17, name: '常磐台中学' },
  { id: 18, name: '秋之镇' }, { id: 19, name: '精灵中心' }, { id: 20, name: '春之镇' },
  { id: 21, name: '圣Gradius学园' }, { id: 22, name: '初始之树' }, { id: 23, name: '幻想世界' },
  { id: 24, name: '永恒的世界' }, { id: 25, name: '妖精驿站' }, { id: 26, name: '冰封墓场' },
  { id: 27, name: '花菱商厦' }, { id: 28, name: 'FARGO前基地' }, { id: 29, name: '风祭森林' },
  { id: 30, name: '天使队移动格纳库' }, { id: 31, name: '和田町研究所' },
  { id: 32, name: 'ＳＣＰ研究设施' }, { id: 33, name: '雏菊之丘' }, { id: 34, name: '英灵殿' },
]

export const GAME_TYPES = {
  0: '个人战',
  2: 'PVE',
  11: '2v2',
  12: '3v3',
  13: '4v4',
  14: '自由团战',
}

export const WEATHER_OPTIONS = [
  { value: 'clear', label: '☀️ 晴天', desc: '无特殊效果' },
  { value: 'rain', label: '🌧️ 雨天', desc: '射击命中-10%' },
  { value: 'fog', label: '🌫️ 大雾', desc: '视野减半' },
  { value: 'storm', label: '⛈️ 暴风雨', desc: '全属性-5%' },
  { value: 'snow', label: '❄️ 暴雪', desc: '移动速度-20%' },
  { value: 'night', label: '🌙 黑夜', desc: '搜索概率-15%' },
]

export const ITEM_KIND_META = {
  weapon: { label: '武器', color: '#f85149', emoji: '⚔️' },
  armor: { label: '防具', color: '#58a6ff', emoji: '🛡️' },
  consumable: { label: '消耗品', color: '#3fb950', emoji: '💊' },
  special: { label: '特殊', color: '#bc8cff', emoji: '✨' },
}

export const NPC_LEVEL_META = {
  easy: { label: '简单', color: '#3fb950' },
  medium: { label: '中等', color: '#d29922' },
  hard: { label: '困难', color: '#f85149' },
  boss: { label: 'BOSS', color: '#bc8cff' },
}
