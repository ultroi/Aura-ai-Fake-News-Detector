const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const { env } = require('../config/env');
const { signToken } = require('../utils/jwt');
const { setAuthCookie, clearAuthCookie } = require('../utils/cookie');
const { success, failure } = require('../utils/response');

const googleClient = new OAuth2Client(env.googleClientId || undefined);

const publicUser = (user) => ({
  id: user._id,
  email: user.email,
  emailVerified: user.emailVerified,
  name: user.name,
  username: user.username,
  picture: user.picture,
  createdAt: user.createdAt,
});

const googleLogin = async (req, res, next) => {
  try {
    if (!env.googleClientId) return failure(res, 503, 'Google authentication is not configured.');
    const token = String(req.body.token || '').trim();
    if (!token) return failure(res, 400, 'Google token is required');

    const ticket = await googleClient.verifyIdToken({ idToken: token, audience: env.googleClientId });
    const payload = ticket.getPayload();
    if (!payload?.email || !payload?.sub) return failure(res, 400, 'Unable to extract Google account details');

    let user = await User.findOne({ email: payload.email.toLowerCase() });
    if (!user) {
      user = await User.create({
        email: payload.email.toLowerCase(),
        googleId: payload.sub,
        name: payload.name || null,
        picture: payload.picture || null,
        emailVerified: true,
        authProviders: ['google'],
      });
    } else {
      user.googleId = user.googleId || payload.sub;
      user.name = payload.name || user.name;
      user.picture = payload.picture || user.picture;
      user.emailVerified = true;
      if (!user.authProviders.includes('google')) user.authProviders.push('google');
      await user.save();
    }

    setAuthCookie(res, signToken(user._id));
    return success(res, 200, 'Google login successful', { user: publicUser(user) });
  } catch (error) {
    error.statusCode = 401;
    next(error);
  }
};

const emailPasswordLogin = async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!email || !password) return failure(res, 400, 'Email and password are required');
    if (password.length < 8 || password.length > 128) return failure(res, 400, 'Password must be between 8 and 128 characters');

    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({ email, passwordHash: await bcrypt.hash(password, 12), emailVerified: true, authProviders: ['password'] });
    } else {
      if (!user.passwordHash) return failure(res, 409, 'This email is linked to Google sign-in. Please continue with Google.');
      if (!(await bcrypt.compare(password, user.passwordHash))) return failure(res, 401, 'Invalid email or password');
      if (!user.authProviders.includes('password')) user.authProviders.push('password');
      await user.save();
    }

    setAuthCookie(res, signToken(user._id));
    return success(res, 200, 'Email/password login successful', { user: publicUser(user) });
  } catch (error) {
    next(error);
  }
};

const getMe = async (req, res) => {
  const user = await User.findById(req.userId).select('-passwordHash');
  if (!user) return failure(res, 404, 'User not found');
  return success(res, 200, 'User retrieved successfully', { user: publicUser(user) });
};

const updateProfile = async (req, res) => {
  const updates = {};
  for (const key of ['name', 'username', 'picture']) {
    if (typeof req.body[key] === 'string') updates[key] = req.body[key].trim();
  }
  if (!Object.keys(updates).length) return failure(res, 400, 'At least one profile field is required');

  const user = await User.findByIdAndUpdate(req.userId, { $set: updates }, { new: true, runValidators: true }).select('-passwordHash');
  if (!user) return failure(res, 404, 'User not found');
  return success(res, 200, 'Profile updated successfully', { user: publicUser(user) });
};

const logout = async (_req, res) => {
  clearAuthCookie(res);
  return success(res, 200, 'Logged out successfully');
};

module.exports = { googleLogin, emailPasswordLogin, getMe, updateProfile, logout, publicUser };
