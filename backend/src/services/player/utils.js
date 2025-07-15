const { dropMapItem, restoreMemoryItem } = require('../../utils/item');

function updateRest(player) {
  if (!player.restStart) return;
  const now = Date.now();
  const sec = Math.floor((now - player.restStart) / 1000);
  if (sec <= 0) return;
  player.sp = Math.min(player.msp, player.sp + sec * 12);
  if (player.sp >= player.msp) {
    player.restStart = 0;
  } else {
    player.restStart += sec * 1000;
  }
}

function applyRest(player) {
  updateRest(player);
  if (player.restStart) {
    player.restStart = 0;
  }
}

function reduceItem(player, idx) {
  let cnt = player[`itms${idx}`];
  if (cnt !== '∞') {
    const num = parseInt(cnt, 10) - 1;
    if (num <= 0) {
      player[`itm${idx}`] = '';
      player[`itmk${idx}`] = '';
      player[`itme${idx}`] = 0;
      player[`itms${idx}`] = '0';
      player[`itmsk${idx}`] = '';
    } else {
      player[`itms${idx}`] = String(num);
    }
  }
}

const ammoMap = [
  { key: 'WJ', kind: 'GBh', num: 4 },
  { key: 'e', kind: 'GBe', num: 10 },
  { key: 'w', kind: 'GBe', num: 10 },
  { key: 'i', kind: 'GBi', num: 10 },
  { key: 'u', kind: 'GBi', num: 10 },
  { key: 'r', kind: 'GBr', num: 20 },
  { key: 'WG', kind: 'GB', num: 6 }
];

function checkAmmoKind(wepk, wepsk) {
  let ret = { kind: 'GB', num: 6 };
  for (const a of ammoMap) {
    if ((a.key.startsWith('W') && wepk.startsWith(a.key)) ||
        (!a.key.startsWith('W') && wepsk.includes(a.key))) {
      ret = { kind: a.kind, num: a.num };
      if (ret.num <= 10 && wepsk.includes('r')) {
        ret.num = ret.kind === 'GBh' ? 6 : 12;
      }
      break;
    }
  }
  return ret;
}

const bulletNames = {
  GB: '手枪弹药',
  GBr: '机枪弹药',
  GBi: '气体弹药',
  GBh: '重型弹药',
  GBe: '能源弹药'
};

function formatPlayer(player) {
  const data = player.toObject ? player.toObject() : { ...player };
  data.att = data.att + (data.wepe || 0) * 2;
  data.def = data.def + (data.arbe || 0) + (data.arhe || 0) +
    (data.arae || 0) + (data.arfe || 0) + (data.arte || 0);
  return data;
}

module.exports = {
  updateRest,
  applyRest,
  reduceItem,
  checkAmmoKind,
  bulletNames,
  dropMapItem,
  restoreMemoryItem,
  formatPlayer
};
