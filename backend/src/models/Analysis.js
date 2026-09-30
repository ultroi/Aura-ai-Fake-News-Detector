const mongoose = require('mongoose');

const analysisSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  mode: { type: String, enum: ['verify', 'research', 'mixed'], default: 'verify' },
  query: { type: String, maxlength: 2000 },
  sourceUrl: { type: String, default: null },
  verdict: { type: String, default: null },
  confidence: { type: Number, min: 0, max: 100, default: null },
  response: { type: String, default: '' },
  shortSummary: { type: String, default: '' },
  reason: { type: String, default: '' },
  keyFacts: { type: [String], default: [] },
  importantContext: { type: String, default: null },
  trustedSources: { type: [String], default: [] },
  suspiciousSources: { type: [String], default: [] },
  sourcesCount: { type: Object, default: { trusted: 0, suspicious: 0 } },
  language: { type: String, default: 'en' },
  timings: { type: Object, default: {} },
}, { timestamps: true });

analysisSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Analysis', analysisSchema);
