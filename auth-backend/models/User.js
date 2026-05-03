const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email address'],
    },
    name: {
      type: String,
      trim: true,
      default: null,
    },
    picture: {
      type: String,
      trim: true,
      default: null,
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true,
      default: null,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    authProviders: {
      type: [String],
      enum: ['google', 'otp'],
      default: [],
    },
    otpHash: {
      type: String,
      default: null,
    },
    otpExpiry: {
      type: Date,
      default: null,
    },
    otpAttempts: {
      type: Number,
      default: 0,
    },
    blockedUntil: {
      type: Date,
      default: null,
    },
    lastOtpSentAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ googleId: 1 }, { unique: true, sparse: true });

// Clear expired OTP data before save
userSchema.pre('save', function (next) {
  if (this.otpExpiry && new Date() > this.otpExpiry) {
    this.otpHash = null;
    this.otpExpiry = null;
    this.otpAttempts = 0;
  }
  next();
});

const User = mongoose.model('User', userSchema);

module.exports = User;
