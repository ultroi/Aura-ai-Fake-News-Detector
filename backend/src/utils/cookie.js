const { env } = require('../config/env');

const baseOptions = () => ({
  httpOnly: true,
  secure: env.nodeEnv === 'production',
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
});

const setAuthCookie = (res, token) => res.cookie(env.cookieName, token, baseOptions());
const clearAuthCookie = (res) => {
  const options = baseOptions();
  delete options.maxAge;
  res.clearCookie(env.cookieName, options);
};

module.exports = { setAuthCookie, clearAuthCookie };
