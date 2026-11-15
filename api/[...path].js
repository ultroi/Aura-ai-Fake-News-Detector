const app = require('../backend/src/app');
const { connectDatabase } = require('../backend/src/config/database');
const { validateRuntimeConfig } = require('../backend/src/config/env');

module.exports = async (req, res) => {
  try {
    validateRuntimeConfig();
    await connectDatabase();
    return app(req, res);
  } catch (error) {
    console.error('[api] Request setup failed:', error.message);
    return res.status(503).json({
      success: false,
      error: { message: 'The API is temporarily unavailable.' },
    });
  }
};

module.exports.config = { maxDuration: 60 };
