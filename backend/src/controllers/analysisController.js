const Analysis = require('../models/Analysis');
const { runAnalysis } = require('../services/analysisService');
const { success, failure } = require('../utils/response');
const { env } = require('../config/env');

const analyze = async (req, res, next) => {
  try {
    const { query, url, images = [], mode = 'verify', language_hint: languageHint } = req.body || {};
    const normalizedQuery = typeof query === 'string' ? query.trim() : '';
    const normalizedUrl = typeof url === 'string' ? url.trim() : '';
    const normalizedMode = ['verify', 'research', 'mixed'].includes(mode) ? mode : null;

    if (!normalizedMode) return failure(res, 400, 'Mode must be one of: verify, research, mixed');
    if (normalizedQuery.length > env.maxQueryLength) return failure(res, 400, `Query cannot exceed ${env.maxQueryLength} characters`);
    if (normalizedUrl.length > 2048) return failure(res, 400, 'URL is too long');
    if (!normalizedQuery && !normalizedUrl && !Array.isArray(images)?.length) {
      return failure(res, 400, 'Provide text, URL, or image(s) for analysis');
    }
    if (!Array.isArray(images) || images.length > env.maxImages) {
      return failure(res, 400, `Maximum ${env.maxImages} images allowed`);
    }

    const result = await runAnalysis({
      query: normalizedQuery || null,
      url: normalizedUrl || null,
      images,
      mode: normalizedMode,
      languageHint: languageHint || null,
    });

    if (req.userId) {
      await Analysis.create({
        user: req.userId,
        mode: result.mode,
        query: normalizedQuery,
        sourceUrl: result.source_url,
        verdict: result.verdict,
        confidence: result.confidence,
        response: result.response,
        shortSummary: result.short_summary,
        reason: result.reason,
        keyFacts: result.key_facts,
        importantContext: result.important_context,
        trustedSources: result.trusted_sources,
        suspiciousSources: result.suspicious_sources,
        sourcesCount: result.sources_count,
        language: result.language,
        timings: result.timings,
      });
    }

    return success(res, 200, 'Analysis completed', result);
  } catch (error) {
    next(error);
  }
};

const history = async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
  const records = await Analysis.find({ user: req.userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .select('-reasoning');
  return success(res, 200, 'Analysis history retrieved', { analyses: records });
};

module.exports = { analyze, history };
