const mongoose = require('mongoose');

const supportRequestSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  type: { type: String, enum: ['bug', 'error', 'suggestion'], required: true },
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  subject: { type: String, required: true, trim: true },
  message: { type: String, required: true, trim: true },
  attachment: { type: Object, default: null },
  status: { type: String, enum: ['open', 'in_progress', 'resolved'], default: 'open' },
}, { timestamps: true });

module.exports = mongoose.model('SupportRequest', supportRequestSchema);
