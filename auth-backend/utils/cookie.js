/**
 * Helpers for setting and clearing authentication cookies
 */

const AUTH_COOKIE_NAME = 'token';

const setAuthCookie = (res, token, options = {}) => {
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    ...options,
  };

  res.cookie(AUTH_COOKIE_NAME, token, cookieOptions);
};

const clearAuthCookie = (res, options = {}) => {
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    ...options,
  };

  res.clearCookie(AUTH_COOKIE_NAME, cookieOptions);
};

module.exports = {
  setAuthCookie,
  clearAuthCookie,
};
