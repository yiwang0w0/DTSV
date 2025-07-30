const express = require('express');
const mongoose = require('mongoose');
const redisClient = require('./config/redis');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const gameRoutes = require('./routes/game');
const adminRoutes = require('./routes/admin');
const userRoutes = require('./routes/user');
const gameService = require('./services/gameService');
const constantsService = require('./services/constantsService');

const app = express();
app.use(cors());
app.use(express.json());
app.use(helmet());
app.use(compression());
const limiter = rateLimit({ windowMs: 60 * 1000, max: 100 });
app.use(limiter);

const mongoUri = process.env.MONGODB_URI;
mongoose
  .connect(mongoUri)
  .then(async () => {
    console.log('MongoDB 已连接');
    await constantsService.loadConstants();
    await gameService.ensureDefaultClubs();
    await gameService.ensureGameInfo();
    await gameService.ensureDefaultRecipes();
  })
  .catch((err) => console.error('MongoDB 连接失败', err));


const performanceMiddleware = require('./middlewares/performance');
app.use(performanceMiddleware);

app.get('/api/ping', (req, res) => res.json({ msg: 'pong' }));
app.use('/api/auth', authRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/user', userRoutes);

app.listen(process.env.PORT, () => {
  console.log(`后端服务已启动，端口：${process.env.PORT}`);
});
