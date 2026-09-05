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
    username: {
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
      enum: ['google', 'password'],
      default: [],
    },
    passwordHash: {
      type: String,
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

const User = mongoose.model('User', userSchema);

module.exports = User;
