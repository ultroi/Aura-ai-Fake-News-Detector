const jwt = require('jsonwebtoken');
const { env } = require('../config/env');

const signToken = (userId) => jwt.sign({ id: String(userId) }, env.jwtSecret, { expiresIn: env.jwtExpire });

const verifyToken = (token) => {
  try {
    return jwt.verify(token, env.jwtSecret);
  } catch {
    return null;
  }
};

module.exports = { signToken, verifyToken };
