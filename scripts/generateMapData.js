const fs = require('fs');
const path = require('path');

function parsePhpArray(content, name) {
  const re = new RegExp('\\$' + name + '\\s*=\\s*Array\\s*\\(([^]*?)\\);');
  const m = content.match(re);
  if (!m) throw new Error(name + ' not found');
  const arr = m[1];
  const itemRe = /\s*(\d+)\s*=>\s*(?:'([^']*)'|"((?:\\.|[^"\\])*)")/g;
  const result = [];
  let mm;
  while ((mm = itemRe.exec(arr)) !== null) {
    const val = mm[2] !== undefined ? mm[2] : mm[3].replace(/\\"/g, '"');
    result[parseInt(mm[1], 10)] = val;
  }
  return result;
}

function parseMapAreas() {
  const file = path.join(__dirname, '../DTS-SAMPLE/include/modules/core/map/config/map.config.php');
  const content = fs.readFileSync(file, 'utf8');
  const names = parsePhpArray(content, 'plsinfo');
  const xys = parsePhpArray(content, 'xyinfo');
  const infos = parsePhpArray(content, 'areainfo');
  const result = names.map((name, idx) => ({
    pid: idx,
    name,
    danger: 0,
    xy: xys[idx] || '',
    info: infos[idx] || ''
  }));
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
