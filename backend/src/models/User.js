const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  name: { type: String, trim: true, default: null },
  username: { type: String, trim: true, default: null },
  picture: { type: String, trim: true, default: null },
  googleId: { type: String, unique: true, sparse: true, default: null },
  passwordHash: { type: String, default: null },
  emailVerified: { type: Boolean, default: false },
  authProviders: {
    type: [String],
    enum: ['google', 'password'],
    default: [],
  },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
