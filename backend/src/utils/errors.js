class GameError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.status = status;
  }
}

class NotFoundError extends GameError {
  constructor(message = '资源不存在') {
    super(message, 404);
  }
}

class ValidationError extends GameError {
  constructor(message = '参数错误') {
    super(message, 400);
  }
}

module.exports = {
  GameError,
  NotFoundError,
  ValidationError,
};
