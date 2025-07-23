const constantsService = require('../services/constantsService');

// 提供读取常量的统一接口，兼容通过 constants.get('KEY') 的调用方式
function get(key) {
  return constantsService.get(key);
}

module.exports = {
  get,
  get START_THRESHOLD() { return constantsService.get('START_THRESHOLD'); },
  get AREA_INTERVAL() { return constantsService.get('AREA_INTERVAL'); },
  get AREA_ADD() { return constantsService.get('AREA_ADD'); },
  get WEATHER_ACTIVE_OBBS() { return constantsService.get('WEATHER_ACTIVE_OBBS'); }
};
