const constantsService = require('../services/constantsService');

module.exports = {
  get START_THRESHOLD() { return constantsService.get('START_THRESHOLD'); },
  get AREA_INTERVAL() { return constantsService.get('AREA_INTERVAL'); },
  get AREA_ADD() { return constantsService.get('AREA_ADD'); },
  get WEATHER_ACTIVE_OBBS() { return constantsService.get('WEATHER_ACTIVE_OBBS'); }
};
