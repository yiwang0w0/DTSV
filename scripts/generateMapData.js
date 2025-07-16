const fs = require('fs');
const path = require('path');

function parseMapAreas() {
  const file = path.join(__dirname, '../DTS-SAMPLE/include/modules/core/map/config/map.config.php');
  const content = fs.readFileSync(file, 'utf8');
  const match = content.match(/\$plsinfo\s*=\s*Array\(([^;]+?)\);/s);
  if (!match) throw new Error('plsinfo not found');
  const arrText = match[1];
  const regex = /\s*(\d+)\s*=>\s*'([^']+)'/g;
  const result = [];
  let m;
  while ((m = regex.exec(arrText)) !== null) {
    result.push({ pid: parseInt(m[1], 10), name: m[2], danger: 0 });
  }
  fs.writeFileSync(path.join(__dirname, '../data/mapareas.json'), JSON.stringify(result, null, 2));
}

function parseMapItems() {
  const file = path.join(__dirname, '../DTS-SAMPLE/include/modules/base/itemmain/config/mapitem.config.php');
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const result = [];
  let iid = 1;
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('//') || t.startsWith('<?')) continue;
    const parts = t.split(',');
    if (parts.length < 8) continue;
    const [time, area, num, itm, itmk, itme, itms, itmsk] = parts;
    for (let i = 0; i < parseInt(num); i++) {
      result.push({
        iid: iid++,
        time: Number(time),
        itm,
        itmk,
        itme: Number(itme),
        itms: itms,
        itmsk,
        pls: Number(area)
      });
    }
  }
  fs.writeFileSync(path.join(__dirname, '../data/mapitems.json'), JSON.stringify(result, null, 2));
}

parseMapAreas();
parseMapItems();
