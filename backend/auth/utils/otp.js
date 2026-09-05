const bcrypt = require('bcrypt');

/**
 * Generate random 6-digit OTP
 */
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Hash OTP using bcrypt
 */
const hashOTP = async (otp) => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(otp, salt);
};

/**
 * Compare plain OTP with hashed OTP
 */
const compareOTP = async (plainOTP, hashedOTP) => {
  return bcrypt.compare(plainOTP, hashedOTP);
};

/**
 * Get OTP expiry time (5 minutes from now)
 */
const getOTPExpiry = () => {
  return new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
};

/**
 * Check if OTP is expired
 */
const isOTPExpired = (expiryTime) => {
  return new Date() > new Date(expiryTime);
};

module.exports = {
  generateOTP,
  hashOTP,
  compareOTP,
  getOTPExpiry,
  isOTPExpired,
};
