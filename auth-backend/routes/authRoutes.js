const express = require('express');
const { body, validationResult } = require('express-validator');
const authController = require('../controllers/authController');
const { authMiddleware } = require('../middleware/auth');
const { sendError } = require('../utils/response');

const router = express.Router();

/**
 * Validation error handler middleware
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors
      .array()
      .map(err => `${err.path || err.param}: ${err.msg}`)
      .join(', ');
    return sendError(res, 400, 'Validation error', { details: errorMessages });
  }
  next();
};

/**
 * POST /auth/google
 * Google OAuth login
 */
router.post(
  '/google',
  body('token')
    .notEmpty()
    .withMessage('Token is required')
    .isString()
    .withMessage('Token must be a string'),
  handleValidationErrors,
  authController.googleLogin
);

/**
 * POST /auth/send-otp
 * Send OTP to email address
 */
router.post(
  '/send-otp',
  body('email')
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail()
    .toLowerCase(),
  handleValidationErrors,
  authController.sendOTP
);

/**
 * POST /auth/verify-otp
 * Verify OTP and issue JWT
 */
router.post(
  '/verify-otp',
  body('email')
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail()
    .toLowerCase(),
  body('otp')
    .notEmpty()
    .withMessage('OTP is required')
    .matches(/^\d{6}$/)
    .withMessage('OTP must be 6 digits'),
  handleValidationErrors,
  authController.verifyOTP
);

/**
 * GET /auth/me
 * Get current authenticated user
 */
router.get('/me', authMiddleware, authController.getMe);

/**
 * POST /auth/logout
 * Logout user (clear JWT cookie)
 */
router.post('/logout', authController.logout);

/**
 * POST /auth/support
 * Submit support request (bug/error/suggestion)
 */
router.post(
  '/support',
  body('type')
    .notEmpty()
    .withMessage('Type is required')
    .isIn(['bug', 'error', 'suggestion'])
    .withMessage('Type must be bug, error, or suggestion'),
  body('name')
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2, max: 80 })
    .withMessage('Name must be between 2 and 80 characters'),
  body('email')
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail()
    .toLowerCase(),
  body('subject')
    .notEmpty()
    .withMessage('Subject is required')
    .isLength({ min: 4, max: 140 })
    .withMessage('Subject must be between 4 and 140 characters'),
  body('message')
    .notEmpty()
    .withMessage('Message is required')
    .isLength({ min: 10, max: 4000 })
    .withMessage('Message must be between 10 and 4000 characters'),
  body('attachment').optional().isObject().withMessage('Attachment must be an object'),
  body('attachment.name')
    .optional({ nullable: true })
    .isString()
    .withMessage('Attachment name must be a string')
    .isLength({ max: 255 })
    .withMessage('Attachment name is too long'),
  body('attachment.type')
    .optional({ nullable: true })
    .isString()
    .withMessage('Attachment type must be a string')
    .isLength({ max: 120 })
    .withMessage('Attachment type is too long'),
  body('attachment.size')
    .optional({ nullable: true })
    .isInt({ min: 1, max: 5 * 1024 * 1024 })
    .withMessage('Attachment size must be between 1 byte and 5MB'),
  body('attachment.dataUrl')
    .optional({ nullable: true })
    .isString()
    .withMessage('Attachment data must be a string'),
  handleValidationErrors,
  authController.submitSupportRequest
);

module.exports = router;
