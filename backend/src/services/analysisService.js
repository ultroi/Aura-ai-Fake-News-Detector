const { env } = require('../config/env');
const { extractClaims } = require('./claimExtractor');
const { extractTextsFromImages } = require('./ocrService');
const { generateSearchQueries } = require('./searchQueryGenerator');
const { searchMultipleQueries } = require('./tavilySearch');
const { evaluateSources, refineWithLLM } = require('./sourceCredibility');
const { generateText } = require('./llmClient');
const { parseModelJson } = require('../utils/json');
const { fetchUrlContent } = require('./urlService');

const VERDICT_LABELS = {
  true: 'TRUE',
  likely_true: 'LIKELY TRUE',
  misleading: 'MISLEADING',
  likely_fake: 'LIKELY FALSE',
  fake: 'FALSE',
  unverified: 'UNVERIFIED',
};

const normalizeVerdict = (value) => {
  const normalized = String(value || '').toLowerCase().trim().replace(/\s+/g, '_');
  const aliases = {
    false: 'fake',
    likely_false: 'likely_fake',
    likelyfalse: 'likely_fake',
    likelytrue: 'likely_true',
    maybe_true: 'likely_true',
    maybe_false: 'likely_fake',
    unverifiable: 'unverified',
    cannot_verify: 'unverified',
  };
  return VERDICT_LABELS[normalized]
    ? normalized
    : aliases[normalized] && VERDICT_LABELS[aliases[normalized]]
      ? aliases[normalized]
      : 'unverified';
};

const normalizeCredibility = (value, fallbackSources = []) => {
  const credibility = value && typeof value === 'object' ? value : {};
  return {
    ...credibility,
    evaluated_sources: Array.isArray(credibility.evaluated_sources)
      ? credibility.evaluated_sources
      : fallbackSources,
    trusted_sources: Array.isArray(credibility.trusted_sources) ? credibility.trusted_sources : [],
    suspicious_sources: Array.isArray(credibility.suspicious_sources) ? credibility.suspicious_sources : [],
    overall_evidence_quality: credibility.overall_evidence_quality || 'insufficient',
    evidence_consensus: credibility.evidence_consensus || 'no_consensus',
  };
};

// Fallback analysis must remain valid when an upstream provider fails or a caller
// omits optional context. Never dereference .length on an unvalidated value.
const fallbackAnalysis = (context = {}) => {
  const mode = context.mode || 'verify';
  const language = context.language || 'en';
  const credibility = normalizeCredibility(context.credibility);
  const sources = Array.isArray(context.sources) ? context.sources : credibility.evaluated_sources;
  const trustedCount = credibility.trusted_sources.length;
  const sourceCount = sources.length;
  const verdict = 'unverified';
  const label = VERDICT_LABELS[verdict];

  return {
    verdict,
    verdict_display: label,
    confidence: Math.min(50, 25 + sourceCount * 5),
    short_summary: `${label} based on the available evidence.`,
    response: `Aura could not establish a reliable conclusion for this ${mode === 'research' ? 'research topic' : 'claim'}. ${sourceCount ? `The search returned ${sourceCount} sources, including ${trustedCount} higher-credibility sources.` : 'No usable sources were returned.'}`,
    reason: `The automated pipeline found ${sourceCount} source(s). Source credibility was evaluated before the final response. More primary evidence may be required.`,
    key_facts: [],
    important_context: language === 'hi' ? 'अधिक प्राथमिक और विश्वसनीय स्रोतों की आवश्यकता है।' : null,
  };
};

const buildSearchEvidence = (sources = []) => {
  const safeSources = Array.isArray(sources) ? sources : [];
  return safeSources.slice(0, env.maxSearchResults).map((source, index) => (
    `[${index + 1}] ${source.title || 'Untitled source'}\nURL: ${source.url || ''}\nDomain: ${source.source_domain || ''}\nSnippet: ${String(source.snippet || source.raw_content || '').slice(0, 1600)}`
  )).join('\n\n');
};

const finalReasoning = async ({ originalInput, mainClaim, extracted, sources, credibility, mode, language }) => {
  const safeExtracted = extracted && typeof extracted === 'object' ? extracted : {};
  const safeCredibility = normalizeCredibility(credibility, Array.isArray(sources) ? sources : []);
  const safeSources = Array.isArray(sources) ? sources : [];
  const system = `You are Aura AI, a careful multilingual fact-checking assistant. Analyze a claim only from the evidence provided. Never invent citations or facts.\n\nFor verify/mixed mode, choose exactly one verdict: true, likely_true, misleading, likely_fake, fake, unverified. Confidence must be 0-100. For research mode, verdict may be null.\n\nReturn strict JSON with: verdict, confidence, short_summary, response, reason, key_facts (array), important_context. The response should be conversational but evidence-led. Keep source URLs out of prose unless necessary; the UI separately displays the sources. Language: ${language || 'en'}.`;
  const user = `MODE: ${mode}\nORIGINAL INPUT:\n${originalInput || ''}\n\nPRIMARY CLAIM:\n${mainClaim || originalInput || ''}\n\nEXTRACTED CLAIMS:\n${JSON.stringify(Array.isArray(safeExtracted.claims) ? safeExtracted.claims : [])}\n\nEVIDENCE QUALITY: ${safeCredibility.overall_evidence_quality}\nEVIDENCE CONSENSUS: ${safeCredibility.evidence_consensus}\n\nSEARCH EVIDENCE:\n${buildSearchEvidence(safeSources) || 'No search evidence available.'}`;

  const result = await generateText({ system, user, json: true });
  return result ? parseModelJson(result.text) : null;
};

const normalizeAnalysis = (result, inputContext = {}) => {
  const credibility = normalizeCredibility(inputContext.credibility);
  const sources = Array.isArray(inputContext.sources)
    ? inputContext.sources
    : credibility.evaluated_sources.filter((source) => source?.should_use !== false);
  const imageTexts = Array.isArray(inputContext.imageTexts) ? inputContext.imageTexts : [];
  const context = {
    ...inputContext,
    mode: inputContext.mode || 'verify',
    language: inputContext.language || 'en',
    credibility,
    sources,
    imageTexts,
  };

  // Critical fix: fallbackAnalysis previously received no `sources` field and
  // threw `Cannot read properties of undefined (reading 'length')` on every
  // unsuccessful LLM path. Context is now normalized before fallback creation.
  const fallback = fallbackAnalysis(context);
  const verdict = context.mode === 'research' ? null : normalizeVerdict(result?.verdict);
  const confidence = context.mode === 'research'
    ? null
    : Math.max(0, Math.min(100, Number(result?.confidence) || fallback.confidence));

  return {
    mode: context.mode,
    response: String(result?.response || result?.reason || fallback.response).trim(),
    short_summary: String(result?.short_summary || (verdict ? `This claim is ${VERDICT_LABELS[verdict].toLowerCase()} based on the available evidence.` : fallback.short_summary)).trim(),
    reason: String(result?.reason || fallback.reason).trim(),
    extracted_image_texts: imageTexts.length ? imageTexts : null,
    verdict,
    verdict_display: verdict ? VERDICT_LABELS[verdict] : null,
    confidence,
    reasoning: result || null,
    key_facts: Array.isArray(result?.key_facts) ? result.key_facts.map(String).slice(0, 10) : fallback.key_facts,
    important_context: result?.important_context ? String(result.important_context) : fallback.important_context,
    trusted_sources: credibility.trusted_sources.slice(0, 10),
    suspicious_sources: credibility.suspicious_sources.slice(0, 10),
    sources_count: {
      trusted: credibility.trusted_sources.length,
      suspicious: credibility.suspicious_sources.length,
    },
    source_url: context.sourceUrl || null,
    language: context.language,
  };
};

const runAnalysis = async (options = {}) => {
  const query = typeof options.query === 'string' ? options.query : '';
  const url = typeof options.url === 'string' ? options.url : '';
  const images = Array.isArray(options.images) ? options.images : [];
  const mode = ['verify', 'research', 'mixed'].includes(options.mode) ? options.mode : 'verify';
  const languageHint = typeof options.languageHint === 'string' ? options.languageHint : '';
  const startedAt = Date.now();
  const timings = {};
  let analysisInput = query;
  let sourceUrl = null;

  if (url) {
    const started = Date.now();
    const urlResult = await fetchUrlContent(url);
    timings.stage_0 = Date.now() - started;
    if (!urlResult?.success && !analysisInput) {
      const error = new Error(urlResult?.error || 'Failed to fetch URL');
      error.statusCode = 400;
      throw error;
    }
    if (urlResult?.success) {
      sourceUrl = url;
      analysisInput = analysisInput
        ? `${analysisInput}\n\nURL CONTENT:\n${urlResult.content || ''}`
        : String(urlResult.content || '');
    }
  }

  const imageTextsResult = images.length
    ? await extractTextsFromImages(images.slice(0, env.maxImages))
    : [];
  const imageTexts = Array.isArray(imageTextsResult) ? imageTextsResult : [];
  if (imageTexts.length) {
    const imageBlock = imageTexts.filter(Boolean).map((text, index) => `IMAGE ${index + 1} TEXT:\n${text}`).join('\n\n');
    analysisInput = analysisInput ? `${analysisInput}\n\n${imageBlock}` : imageBlock;
  }

  if (!analysisInput.trim()) {
    const error = new Error('Provide text, URL, or image(s) for analysis');
    error.statusCode = 400;
    throw error;
  }

  const stage1 = Date.now();
  const extractedResult = await extractClaims(analysisInput.slice(0, env.maxQueryLength * 4));
  const extracted = {
    ...(extractedResult && typeof extractedResult === 'object' ? extractedResult : {}),
    language: extractedResult?.language || languageHint || 'en',
    main_claim: String(extractedResult?.main_claim || analysisInput).trim(),
    claims: Array.isArray(extractedResult?.claims) && extractedResult.claims.length
      ? extractedResult.claims
      : [{ id: 'c1', claim: analysisInput, subject: '', type: 'factual' }],
    entities: Array.isArray(extractedResult?.entities) ? extractedResult.entities : [],
    dates: Array.isArray(extractedResult?.dates) ? extractedResult.dates : [],
  };
  timings.stage_1 = Date.now() - stage1;

  const claims = extracted.claims.slice(0, env.maxClaims);
  const searchStage = Date.now();
  const claimSearches = await Promise.all(claims.map(async (claim) => {
    const bundle = await generateSearchQueries({
      claim: String(claim?.claim || extracted.main_claim),
      entities: extracted.entities,
      dates: extracted.dates,
      mode,
    });
    return searchMultipleQueries(bundle);
  }));
  const searchResults = claimSearches.flatMap((item) => (Array.isArray(item?.combined_results) ? item.combined_results : []));
  const uniqueSources = Array.from(new Map(searchResults.map((item) => [item.url || `${item.title}:${item.source_domain}`, item])).values())
    .slice(0, env.maxSearchResults);
  timings.stage_2 = Date.now() - searchStage;

  let credibility = normalizeCredibility({
    evaluated_sources: uniqueSources,
    trusted_sources: [],
    suspicious_sources: [],
    overall_evidence_quality: 'insufficient',
    evidence_consensus: 'no_consensus',
  }, uniqueSources);

  if (mode !== 'research') {
    const stage3 = Date.now();
    try {
      const evaluated = await evaluateSources(uniqueSources, extracted.main_claim);
      const refined = await refineWithLLM(extracted.main_claim, normalizeCredibility(evaluated, uniqueSources));
      credibility = normalizeCredibility(refined, uniqueSources);
    } catch (error) {
      // Keep the deterministic source evaluation as a usable fallback when the
      // LLM provider is unavailable or source refinement fails unexpectedly.
      console.warn('[analysis] Source refinement failed; using available source scores:', error.message);
      try {
        credibility = normalizeCredibility(await evaluateSources(uniqueSources), uniqueSources);
      } catch (evaluationError) {
        console.warn('[analysis] Deterministic source evaluation failed:', evaluationError.message);
      }
    }
    timings.stage_3 = Date.now() - stage3;
  } else {
    credibility = normalizeCredibility({
      evaluated_sources: uniqueSources,
      trusted_sources: uniqueSources.slice(0, 8).map((item) => item.url).filter(Boolean),
      suspicious_sources: [],
      overall_evidence_quality: uniqueSources.length >= 3 ? 'moderate' : uniqueSources.length ? 'weak' : 'insufficient',
      evidence_consensus: 'no_consensus',
    }, uniqueSources);
  }

  const usableSources = credibility.evaluated_sources.filter((source) => source?.should_use !== false);
  const stage4 = Date.now();
  const finalResult = await finalReasoning({
    originalInput: query || analysisInput,
    mainClaim: extracted.main_claim,
    extracted,
    sources: usableSources,
    credibility,
    mode,
    language: languageHint || extracted.language,
  });
  timings.stage_4 = Date.now() - stage4;

  const response = normalizeAnalysis(finalResult, {
    mode,
    query,
    imageTexts,
    sourceUrl,
    credibility,
    sources: usableSources,
    language: languageHint || extracted.language,
  });

  timings.total = Date.now() - startedAt;
  return { ...response, timings, extracted_claims: extracted.claims, entities: extracted.entities };
};

module.exports = { runAnalysis, VERDICT_LABELS };