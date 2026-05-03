const rateLimit = require('express-rate-limit');

/**
 * Global rate limiter
 * 100 requests per 15 minutes
 */
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health check
    return req.path === '/health';
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

/**
 * OTP send limiter
 * 5 requests per 60 minutes (per email)
 */
const otpSendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Too many OTP requests. Please try again later.',
  skipSuccessfulRequests: false,
  keyGenerator: (req) => {
    return req.body.email || req.ip;
  },
});

/**
 * OTP verify limiter
 * 15 requests per 15 minutes (per email)
 */
const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: 'Too many OTP verification attempts. Please try again later.',
  skipSuccessfulRequests: false,
  keyGenerator: (req) => {
    return req.body.email || req.ip;
  },
});

module.exports = {
  globalLimiter,
  authLimiter,
  otpSendLimiter,
  otpVerifyLimiter,
};
