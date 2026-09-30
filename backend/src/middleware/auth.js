const { verifyToken } = require('../utils/jwt');
const { env } = require('../config/env');
const { failure } = require('../utils/response');

const getToken = (req) => req.cookies?.[env.cookieName] || null;

const optionalAuth = (req, _res, next) => {
  const token = getToken(req);
  if (token) {
    const decoded = verifyToken(token);
    if (decoded?.id) req.userId = decoded.id;
  }
  next();
};

const authRequired = (req, res, next) => {
  const token = getToken(req);
  if (!token) return failure(res, 401, 'Authentication required. Please login first.');

  const decoded = verifyToken(token);
  if (!decoded?.id) return failure(res, 401, 'Invalid or expired token. Please login again.');

  req.userId = decoded.id;
  next();
};

module.exports = { authRequired, optionalAuth };
