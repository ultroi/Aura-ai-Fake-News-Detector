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
  return VERDICT_LABELS[normalized] ? normalized : aliases[normalized] && VERDICT_LABELS[aliases[normalized]] ? aliases[normalized] : 'unverified';
};

const fallbackAnalysis = ({ mode, claim, sources, credibility, language }) => {
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

const buildSearchEvidence = (sources) => sources.slice(0, env.maxSearchResults).map((source, index) => (
  `[${index + 1}] ${source.title}\nURL: ${source.url}\nDomain: ${source.source_domain}\nSnippet: ${String(source.snippet || source.raw_content || '').slice(0, 1600)}`
)).join('\n\n');

const finalReasoning = async ({ originalInput, mainClaim, extracted, sources, credibility, mode, language }) => {
  const system = `You are Aura AI, a careful multilingual fact-checking assistant. Analyze a claim only from the evidence provided. Never invent citations or facts.\n\nFor verify/mixed mode, choose exactly one verdict: true, likely_true, misleading, likely_fake, fake, unverified. Confidence must be 0-100. For research mode, verdict may be null.\n\nReturn strict JSON with: verdict, confidence, short_summary, response, reason, key_facts (array), important_context. The response should be conversational but evidence-led. Keep source URLs out of prose unless necessary; the UI separately displays the sources. Language: ${language}.`;
  const user = `MODE: ${mode}\nORIGINAL INPUT:\n${originalInput}\n\nPRIMARY CLAIM:\n${mainClaim}\n\nEXTRACTED CLAIMS:\n${JSON.stringify(extracted.claims)}\n\nEVIDENCE QUALITY: ${credibility.overall_evidence_quality}\nEVIDENCE CONSENSUS: ${credibility.evidence_consensus || 'no_consensus'}\n\nSEARCH EVIDENCE:\n${buildSearchEvidence(sources) || 'No search evidence available.'}`;

  const result = await generateText({ system, user, json: true });
  return result ? parseModelJson(result.text) : null;
};

const normalizeAnalysis = (result, context) => {
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
    extracted_image_texts: context.imageTexts.length ? context.imageTexts : null,
    verdict,
    verdict_display: verdict ? VERDICT_LABELS[verdict] : null,
    confidence,
    reasoning: result || null,
    key_facts: Array.isArray(result?.key_facts) ? result.key_facts.map(String).slice(0, 10) : fallback.key_facts,
    important_context: result?.important_context ? String(result.important_context) : fallback.important_context,
    trusted_sources: context.credibility.trusted_sources.slice(0, 10),
    suspicious_sources: context.credibility.suspicious_sources.slice(0, 10),
    sources_count: {
      trusted: context.credibility.trusted_sources.length,
      suspicious: context.credibility.suspicious_sources.length,
    },
    source_url: context.sourceUrl || null,
    language: context.language,
  };
};

const runAnalysis = async ({ query, url, images = [], mode = 'verify', languageHint }) => {
  const startedAt = Date.now();
  const timings = {};
  let analysisInput = query || '';
  let sourceUrl = null;

  if (url) {
    const started = Date.now();
    const urlResult = await fetchUrlContent(url);
    timings.stage_0 = Date.now() - started;
    if (!urlResult.success && !analysisInput) {
      const error = new Error(urlResult.error || 'Failed to fetch URL');
      error.statusCode = 400;
      throw error;
    }
    if (urlResult.success) {
      sourceUrl = url;
      analysisInput = analysisInput
        ? `${analysisInput}\n\nURL CONTENT:\n${urlResult.content}`
        : urlResult.content;
    }
  }

  const imageTexts = images.length ? await extractTextsFromImages(images.slice(0, env.maxImages)) : [];
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
  const extracted = await extractClaims(analysisInput.slice(0, env.maxQueryLength * 4));
  timings.stage_1 = Date.now() - stage1;

  const claims = extracted.claims.slice(0, env.maxClaims);
  const searchStage = Date.now();
  const claimSearches = await Promise.all(claims.map(async (claim) => {
    const bundle = await generateSearchQueries({
      claim: claim.claim,
      entities: extracted.entities,
      dates: extracted.dates,
      mode,
    });
    return searchMultipleQueries(bundle);
  }));
  const searchResults = claimSearches.flatMap((item) => item.combined_results || []);
  const uniqueSources = Array.from(new Map(searchResults.map((item) => [item.url || `${item.title}:${item.source_domain}`, item])).values())
    .slice(0, env.maxSearchResults);
  timings.stage_2 = Date.now() - searchStage;

  let credibility = {
    evaluated_sources: uniqueSources,
    trusted_sources: [],
    suspicious_sources: [],
    overall_evidence_quality: 'insufficient',
    evidence_consensus: 'no_consensus',
  };

  if (mode !== 'research') {
    const stage3 = Date.now();
    credibility = await evaluateSources(uniqueSources, extracted.main_claim);
    credibility = await refineWithLLM(extracted.main_claim, credibility);
    timings.stage_3 = Date.now() - stage3;
  } else {
    credibility = {
      evaluated_sources: uniqueSources,
      trusted_sources: uniqueSources.slice(0, 8).map((item) => item.url).filter(Boolean),
      suspicious_sources: [],
      overall_evidence_quality: uniqueSources.length >= 3 ? 'moderate' : uniqueSources.length ? 'weak' : 'insufficient',
      evidence_consensus: 'no_consensus',
    };
  }

  const stage4 = Date.now();
  const finalResult = await finalReasoning({
    originalInput: query || analysisInput,
    mainClaim: extracted.main_claim,
    extracted,
    sources: credibility.evaluated_sources.filter((source) => source.should_use !== false),
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
    language: languageHint || extracted.language,
  });

  timings.total = Date.now() - startedAt;
  return { ...response, timings, extracted_claims: extracted.claims, entities: extracted.entities };
};

module.exports = { runAnalysis, VERDICT_LABELS };
