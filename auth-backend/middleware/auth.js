const { verifyToken } = require('../utils/jwt');
const { sendError } = require('../utils/response');

/**
 * Authentication middleware - verify JWT from cookies
 */
const authMiddleware = (req, res, next) => {
  try {
    const token = req.cookies?.token;

    if (!token) {
      return sendError(res, 401, 'Authentication required. Please login first.');
    }

    // Verify token
    const decoded = verifyToken(token);

    if (!decoded) {
      console.warn('Suspicious auth failure: invalid or expired auth cookie', {
        ip: req.ip,
        userAgent: req.get('user-agent'),
        path: req.originalUrl,
      });
      return sendError(res, 401, 'Invalid or expired token. Please login again.');
    }

    // Attach user ID to request
    req.userId = decoded.id;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return sendError(res, 401, 'Authentication failed');
  }
};

module.exports = {
  authMiddleware,
};
