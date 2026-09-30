const { env } = require('../config/env');

const errorHandler = (err, req, res, _next) => {
  console.error('[api:error]', {
    method: req.method,
    path: req.originalUrl,
    message: err.message,
  });

  const status = err.statusCode || 500;
  const message = env.nodeEnv === 'production' && status >= 500
    ? 'Internal server error'
    : err.message || 'Internal server error';

  res.status(status).json({
    success: false,
    error: { message },
  });
};

module.exports = errorHandler;
