const rateLimit = require('express-rate-limit');

/**
 * Global rate limiter
 * 1000 requests per 15 minutes (relaxed for development)
 */
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health check and auth/me
    return req.path === '/health' || req.path === '/auth/me';
  },
});

/**
 * Auth routes rate limiter
 * 10 requests per 15 minutes
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many authentication attempts, please try again later.',
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    // Use email as key for auth attempts (if available)
    return req.body.email || req.ip;
  },
  skip: (req) => {
    // Skip rate limiting for Google OAuth (successful requests)
    return req.path === '/google';
  },
});

module.exports = {
  globalLimiter,
  authLimiter,
};
