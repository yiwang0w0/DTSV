const constants = require('../config/constants');

module.exports = (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (duration > constants.SLOW_REQUEST_THRESHOLD) {
      console.warn(`Slow request: ${req.method} ${req.path} took ${duration}ms`);
    }
  });
  next();
};
