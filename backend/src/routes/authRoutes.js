const express = require('express');
const { body, validationResult } = require('express-validator');
const { authRequired, optionalAuth } = require('../middleware/auth');
const authController = require('../controllers/authController');
const supportController = require('../controllers/supportController');
const { failure } = require('../utils/response');

const router = express.Router();

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return failure(res, 400, 'Validation error', errors.array());
  next();
};

router.post('/google',
  body('token').isString().trim().notEmpty(),
  validate,
  authController.googleLogin,
);

router.post('/email-login',
  body('email').isEmail().normalizeEmail(),
  body('password').isString().isLength({ min: 8, max: 128 }),
  validate,
  authController.emailPasswordLogin,
);

router.get('/me', authRequired, authController.getMe);

router.patch('/profile',
  authRequired,
  body('name').optional().isString().trim().isLength({ min: 2, max: 80 }),
  body('username').optional().isString().trim().isLength({ min: 2, max: 30 }),
  body('picture').optional().isString().trim().isLength({ max: 2048 }),
  validate,
  authController.updateProfile,
);

router.post('/logout', authController.logout);

router.post('/support',
  optionalAuth,
  body('type').isIn(['bug', 'error', 'suggestion']),
  body('name').isString().trim().isLength({ min: 2, max: 80 }),
  body('email').isEmail().normalizeEmail(),
  body('subject').isString().trim().isLength({ min: 4, max: 140 }),
  body('message').isString().trim().isLength({ min: 10, max: 4000 }),
  body('attachment').optional().isObject(),
  validate,
  supportController.submitSupportRequest,
);

module.exports = router;
