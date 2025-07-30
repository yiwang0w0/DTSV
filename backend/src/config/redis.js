const redis = require('redis');

const client = redis.createClient({ url: process.env.REDIS_URL });
client.connect().then(() => console.log('Redis 已连接'));

module.exports = client;
