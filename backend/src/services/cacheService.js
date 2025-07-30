const redis = require('../config/redis');

class CacheService {
  async get(key) {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  async set(key, value, ttl = 300) {
    await redis.setEx(key, ttl, JSON.stringify(value));
  }

  async invalidate(pattern) {
    const keys = await redis.keys(pattern);
    if (keys.length) await redis.del(keys);
  }
}

module.exports = new CacheService();
