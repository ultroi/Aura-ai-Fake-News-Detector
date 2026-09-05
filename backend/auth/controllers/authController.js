const bcrypt = require('bcrypt');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const { generateToken } = require('../utils/jwt');
const { sendSupportRequestEmail } = require('../utils/email');
const { sendError, sendSuccess } = require('../utils/response');
const { setAuthCookie, clearAuthCookie } = require('../utils/cookie');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const logAuthEvent = (level, message, meta = {}) => {
  const payload = { ...meta };
  if (level === 'warn') {
    console.warn(message, payload);
    return;
  }

  if (level === 'error') {
    console.error(message, payload);
    return;
  }

  console.log(message, payload);
};

/**
 * Handle Google OAuth login
 */
exports.googleLogin = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return sendError(res, 400, 'Google token is required');
    }

    // Verify Google token
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const email = payload.email;
    const googleId = payload.sub;
    const name = payload.name || null;
    const picture = payload.picture || null;

    if (!email) {
      return sendError(res, 400, 'Unable to extract email from Google token');
    }

    // Find or create user (match by email primarily)
    let user = await User.findOne({ email });

    if (!user) {
      // Create new user and mark email as verified
      user = new User({
        email,
        googleId,
        name,
        picture,
        emailVerified: true,
        authProviders: ['google'],
      });
      await user.save();
    } else {
      let updated = false;

      // Link googleId if missing
      if (!user.googleId) {
        user.googleId = googleId;
        updated = true;
      }

      if (name && user.name !== name) {
        user.name = name;
        updated = true;
      }

      if (picture && user.picture !== picture) {
        user.picture = picture;
        updated = true;
      }

      if (!user.emailVerified) {
        user.emailVerified = true;
        updated = true;
      }

      // Ensure authProviders contains 'google'
      if (!Array.isArray(user.authProviders)) user.authProviders = [];
      if (!user.authProviders.includes('google')) {
        user.authProviders.push('google');
        updated = true;
      }

      if (updated) {
        await user.save();
      }
    }

    // Generate JWT token
    const jwtToken = generateToken(user._id);

    // Set authentication cookie
    setAuthCookie(res, jwtToken);

    return sendSuccess(res, 200, 'Google login successful', {
      user: {
        id: user._id,
        email: user.email,
        emailVerified: user.emailVerified,
        name: user.name,
        picture: user.picture,
      },
    });
  } catch (error) {
    logAuthEvent('error', 'Google login error', {
      error: error.message,
      code: error.code,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    return sendError(res, 401, 'Invalid Google token or login failed');
  }
};

/**
 * Email + password authentication
 */
exports.emailPasswordLogin = async (req, res) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : req.body.email;
    const { password } = req.body;

    if (!email || !password) {
      return sendError(res, 400, 'Email and password are required');
    }

    if (typeof password !== 'string' || password.length < 8) {
      return sendError(res, 400, 'Password must be at least 8 characters');
    }

    let user = await User.findOne({ email });

    if (!user) {
      const passwordHash = await bcrypt.hash(password, 10);
      user = new User({
        email,
        passwordHash,
        emailVerified: true,
        authProviders: ['password'],
      });
      await user.save();
    } else {
      if (!user.passwordHash) {
        if (Array.isArray(user.authProviders) && user.authProviders.includes('google')) {
          return sendError(res, 409, 'This email is linked to Google sign-in. Please continue with Google.');
        }

        user.passwordHash = await bcrypt.hash(password, 10);
        user.emailVerified = true;
        if (!Array.isArray(user.authProviders)) user.authProviders = [];
        if (!user.authProviders.includes('password')) user.authProviders.push('password');
        await user.save();
      } else {
        const isValidPassword = await bcrypt.compare(password, user.passwordHash);

        if (!isValidPassword) {
          logAuthEvent('warn', 'Email/password login failed: invalid password', {
            email,
            ip: req.ip,
          });
          return sendError(res, 401, 'Invalid email or password');
        }
      }

      if (!Array.isArray(user.authProviders)) user.authProviders = [];
      if (!user.authProviders.includes('password')) {
        user.authProviders.push('password');
        await user.save();
      }
    }

    const jwtToken = generateToken(user._id);
    setAuthCookie(res, jwtToken);

    return sendSuccess(res, 200, 'Email/password login successful', {
      user: {
        id: user._id,
        email: user.email,
        emailVerified: user.emailVerified,
        name: user.name,
        username: user.username,
        picture: user.picture,
      },
    });
  } catch (error) {
    logAuthEvent('error', 'Email/password login error', {
      error: error.message,
      code: error.code,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    return sendError(res, 500, 'Failed to authenticate with email/password');
  }
};

/**
 * Get current authenticated user
 */
exports.getMe = async (req, res) => {
  try {
    const userId = req.userId; // Set by auth middleware

    const user = await User.findById(userId).select('-passwordHash');

    if (!user) {
      return sendError(res, 404, 'User not found');
    }

    return sendSuccess(res, 200, 'User retrieved successfully', {
      user: {
        id: user._id,
        email: user.email,
        emailVerified: user.emailVerified,
        name: user.name,
        username: user.username,
        picture: user.picture,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    logAuthEvent('error', 'Get user error', {
      error: error.message,
      code: error.code,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    return sendError(res, 500, 'Failed to retrieve user');
  }
};

/**
 * Logout user
 */
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.userId;
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : undefined;
    const username = typeof req.body.username === 'string' ? req.body.username.trim() : undefined;
    const picture = typeof req.body.picture === 'string' ? req.body.picture.trim() : undefined;

    if (name === undefined && username === undefined && picture === undefined) {
      return sendError(res, 400, 'At least one profile field is required');
    }

    const user = await User.findById(userId);

    if (!user) {
      return sendError(res, 404, 'User not found');
    }

    if (name !== undefined) user.name = name || user.name;
    if (username !== undefined) user.username = username || user.username;
    if (picture !== undefined) user.picture = picture || user.picture;

    await user.save();

    return sendSuccess(res, 200, 'Profile updated successfully', {
      user: {
        id: user._id,
        email: user.email,
        emailVerified: user.emailVerified,
        name: user.name,
        username: user.username,
        picture: user.picture,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    logAuthEvent('error', 'Update profile error', {
      error: error.message,
      code: error.code,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    return sendError(res, 500, 'Failed to update profile');
  }
};

exports.logout = async (req, res) => {
  try {
    // Clear authentication cookie
    clearAuthCookie(res);
    return sendSuccess(res, 200, 'Logged out successfully');
  } catch (error) {
    logAuthEvent('error', 'Logout error', {
      error: error.message,
      code: error.code,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    return sendError(res, 500, 'Failed to logout');
  }
};

/**
 * Submit help/support request
 */
exports.submitSupportRequest = async (req, res) => {
  try {
    const type = typeof req.body.type === 'string' ? req.body.type.trim().toLowerCase() : '';
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const subject = typeof req.body.subject === 'string' ? req.body.subject.trim() : '';
    const message = typeof req.body.message === 'string' ? req.body.message.trim() : '';
    const attachment = req.body.attachment && typeof req.body.attachment === 'object' ? req.body.attachment : null;

    if (!type || !name || !email || !subject || !message) {
      return sendError(res, 400, 'All support fields are required');
    }

    const allowedTypes = ['bug', 'error', 'suggestion'];
    if (!allowedTypes.includes(type)) {
      return sendError(res, 400, 'Invalid support request type');
    }

    await sendSupportRequestEmail({
      type,
      name,
      email,
      subject,
      message,
      userId: req.userId || null,
      source: 'frontend-app',
      attachment,
    });

    return sendSuccess(res, 200, 'Support request sent successfully');
  } catch (error) {
    logAuthEvent('error', 'Support request error', {
      error: error.message,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    return sendError(res, 500, 'Failed to send support request');
  }
};
