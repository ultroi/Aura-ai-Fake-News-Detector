const express = require('express');
const { body, validationResult } = require('express-validator');
const { optionalAuth, authRequired } = require('../middleware/auth');
const { analysisLimiter } = require('../middleware/rateLimiter');
const { analyze, history } = require('../controllers/analysisController');
const { failure } = require('../utils/response');

const router = express.Router();

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return failure(res, 400, 'Validation error', errors.array());
  next();
};

router.post('/',
  analysisLimiter,
  optionalAuth,
  body('query').optional().isString().trim().isLength({ max: 2000 }),
  body('url').optional().isString().trim().isLength({ max: 2048 }),
  body('images').optional().isArray({ max: 5 }),
  body('mode').optional().isIn(['verify', 'research', 'mixed']),
  body('language_hint').optional().isIn(['en', 'hi', 'hinglish']),
  validate,
  analyze,
);

router.get('/history', authRequired, history);

module.exports = router;
