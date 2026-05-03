const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const { generateToken } = require('../utils/jwt');
const { generateOTP, hashOTP, compareOTP, getOTPExpiry, isOTPExpired } = require('../utils/otp');
const { sendOTPEmail, sendVerificationSuccessEmail, sendSupportRequestEmail } = require('../utils/email');
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
 * Send OTP to email
 */
exports.sendOTP = async (req, res) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : req.body.email;

    if (!email) {
      return sendError(res, 400, 'Email is required');
    }

    // Check if user can send OTP (rate limit & block checks)
    let user = await User.findOne({ email });

    if (user) {
      // Check 60s cooldown for OTP sends
      if (user.lastOtpSentAt) {
        const timeSinceLastOTP = Date.now() - new Date(user.lastOtpSentAt).getTime();
        const cooldownMs = 60 * 1000; // 60 seconds

        if (timeSinceLastOTP < cooldownMs) {
          const secondsRemaining = Math.ceil((cooldownMs - timeSinceLastOTP) / 1000);
          logAuthEvent('warn', 'OTP send cooldown triggered', {
            email,
            ip: req.ip,
            secondsRemaining,
          });
          return sendError(res, 429, `Please wait ${secondsRemaining} seconds before requesting another OTP`);
        }
      }

      // Check if user is blocked due to too many failed OTP attempts
      if (user.blockedUntil) {
        const now = new Date();
        if (now < new Date(user.blockedUntil)) {
          const minutesRemaining = Math.ceil((new Date(user.blockedUntil) - now) / (60 * 1000));
          logAuthEvent('warn', 'OTP send blocked due to brute-force protection', {
            email,
            ip: req.ip,
            blockedUntil: user.blockedUntil,
            minutesRemaining,
          });
          return sendError(res, 429, `Account is temporarily blocked. Try again in ${minutesRemaining} minutes`);
        } else {
          // Unblock if time has passed
          user.blockedUntil = null;
          user.otpAttempts = 0;
          await user.save();
        }
      }
    } else {
      // Create new user with unverified status
      user = new User({ email, emailVerified: false, authProviders: [] });
    }

    // Generate and hash OTP
    const otp = generateOTP();
    const otpHash = await hashOTP(otp);

    // Update user
    user.otpHash = otpHash;
    user.otpExpiry = getOTPExpiry();
    user.otpAttempts = 0;
    user.lastOtpSentAt = new Date();
    await user.save();

    // Send OTP via email
    try {
      await sendOTPEmail(email, otp);
    } catch (emailError) {
      logAuthEvent('error', 'Failed to send OTP email', {
        email,
        error: emailError.message,
        ip: req.ip,
      });
      return sendError(res, 500, 'Failed to send OTP email. Please try again later.');
    }

    return sendSuccess(res, 200, 'OTP sent successfully. Check your email.', {
      email,
      expiresIn: '5 minutes',
    });
  } catch (error) {
    logAuthEvent('error', 'Send OTP error', {
      error: error.message,
      code: error.code,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    return sendError(res, 500, 'Failed to send OTP');
  }
};

/**
 * Verify OTP and issue JWT
 */
exports.verifyOTP = async (req, res) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : req.body.email;
    const { otp } = req.body;

    if (!email || !otp) {
      return sendError(res, 400, 'Email and OTP are required');
    }

    // Validate OTP format (6 digits)
    if (!/^\d{6}$/.test(otp)) {
      return sendError(res, 400, 'OTP must be 6 digits');
    }

    // Find user
    const user = await User.findOne({ email });

    if (!user) {
      logAuthEvent('warn', 'OTP verify failed: user not found', {
        email,
        ip: req.ip,
      });
      return sendError(res, 404, 'User not found. Please request an OTP first.');
    }

    // Check if account is blocked
    if (user.blockedUntil) {
      const now = new Date();
      if (now < new Date(user.blockedUntil)) {
        const minutesRemaining = Math.ceil((new Date(user.blockedUntil) - now) / (60 * 1000));
          logAuthEvent('warn', 'OTP verify blocked due to brute-force protection', {
            email,
            ip: req.ip,
            blockedUntil: user.blockedUntil,
            minutesRemaining,
          });
        return sendError(res, 429, `Account is temporarily blocked. Try again in ${minutesRemaining} minutes`);
      } else {
        // Unblock if time has passed
        user.blockedUntil = null;
        user.otpAttempts = 0;
        await user.save();
      }
    }

    // Check if OTP exists
    if (!user.otpHash) {
      logAuthEvent('warn', 'OTP verify failed: no active OTP', {
        email,
        ip: req.ip,
      });
      return sendError(res, 400, 'No OTP found. Please request a new OTP.');
    }

    // Check if OTP is expired
    if (isOTPExpired(user.otpExpiry)) {
      logAuthEvent('warn', 'OTP verify failed: expired OTP', {
        email,
        ip: req.ip,
        otpExpiry: user.otpExpiry,
      });
      user.otpHash = null;
      user.otpExpiry = null;
      user.otpAttempts = 0;
      await user.save();
      return sendError(res, 400, 'OTP has expired. Please request a new one.');
    }

    // Check OTP attempts (max 5)
    if (user.otpAttempts >= 5) {
      // Block account for 15 minutes
      user.blockedUntil = new Date(Date.now() + 15 * 60 * 1000);
      await user.save();
      logAuthEvent('warn', 'OTP verify rate limit exceeded; user blocked', {
        email,
        ip: req.ip,
        attempts: user.otpAttempts,
        blockedUntil: user.blockedUntil,
      });
      return sendError(res, 429, 'Too many failed attempts. Account blocked for 15 minutes.');
    }

    // Compare OTP
    const isValidOTP = await compareOTP(otp, user.otpHash);

    if (!isValidOTP) {
      // Increment attempts
      user.otpAttempts += 1;
      await user.save();

      logAuthEvent('warn', 'OTP verify failed: invalid OTP', {
        email,
        ip: req.ip,
        attempts: user.otpAttempts,
      });

      const attemptsRemaining = 5 - user.otpAttempts;
      return sendError(res, 401, `Invalid OTP. ${attemptsRemaining} attempts remaining.`);
    }

    // OTP is valid
    // Mark user as verified and ensure authProviders contains 'otp'
    user.emailVerified = true;
    user.otpHash = null;
    user.otpExpiry = null;
    user.otpAttempts = 0;
    user.blockedUntil = null;
    if (!Array.isArray(user.authProviders)) user.authProviders = [];
    if (!user.authProviders.includes('otp')) user.authProviders.push('otp');
    await user.save();

    // Send verification success email
    try {
      await sendVerificationSuccessEmail(email);
    } catch (emailError) {
      console.error('Email sending error:', emailError);
      // Continue even if email fails
    }

    // Generate JWT token
    const jwtToken = generateToken(user._id);

    // Set authentication cookie
    setAuthCookie(res, jwtToken);

    return sendSuccess(res, 200, 'Email verified successfully', {
      user: {
        id: user._id,
        email: user.email,
        emailVerified: user.emailVerified,
      },
    });
  } catch (error) {
    logAuthEvent('error', 'Verify OTP error', {
      error: error.message,
      code: error.code,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    return sendError(res, 500, 'Failed to verify OTP');
  }
};

/**
 * Get current authenticated user
 */
exports.getMe = async (req, res) => {
  try {
    const userId = req.userId; // Set by auth middleware

    const user = await User.findById(userId).select('-otpHash -otpExpiry -otpAttempts');

    if (!user) {
      return sendError(res, 404, 'User not found');
    }

    return sendSuccess(res, 200, 'User retrieved successfully', {
      user: {
        id: user._id,
        email: user.email,
        emailVerified: user.emailVerified,
        name: user.name,
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
exports.logout = async (req, res) => {
  try {
    // Clear authentication cookie
    clearAuthCookie(res);

    return sendSuccess(res, 200, 'Logout successful');
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
