const fs = require('fs');
const path = require('path');

function parseMapTraps() {
  const file = path.join(__dirname, '../DTS-SAMPLE/include/modules/base/items/trap/config/trapitem.config.php');
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const result = [];
  let tid = 1;
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('//') || t.startsWith('<?')) continue;
    const parts = t.split(',');
    if (parts.length < 8) continue;
    const [time, area, num, itm, itmk, itme, itms, itmsk] = parts;
    const timeNum = parseInt(time);
    const areaNum = parseInt(area);
    const count = parseInt(num);
    for (let i = 0; i < count; i++) {
      result.push({
        tid: tid++,
        itm,
        itmk,
        itme: Number(itme),
        itms: String(itms),
        itmsk: itmsk || '',
        pls: areaNum,
        time: timeNum
      });
    }
  }
  fs.writeFileSync(path.join(__dirname, '../data/maptraps.json'), JSON.stringify(result, null, 2));
}

parseMapTraps();
