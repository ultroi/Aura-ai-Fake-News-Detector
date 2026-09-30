const { generateText } = require('./llmClient');
const { parseModelJson } = require('../utils/json');

const TRUSTED_DOMAINS = [
  'bbc.com', 'bbc.co.uk', 'reuters.com', 'apnews.com', 'theguardian.com', 'nytimes.com',
  'aljazeera.com', 'factcheck.org', 'snopes.com', 'politifact.com', 'fullfact.org',
  'pib.gov.in', 'mea.gov.in', 'indiabudget.gov.in', 'wikipedia.org', 'britannica.com',
  'who.int', 'un.org', 'gov.in', 'nic.in', 'edu',
];
const SUSPICIOUS_MARKERS = ['fake-news.com', 'clickbait', 'propoganda', 'rumor', 'conspiracy', 'anonymous'];

const domainScore = (domain) => {
  const value = String(domain || '').toLowerCase();
  if (TRUSTED_DOMAINS.some((trusted) => value === trusted || value.endsWith(`.${trusted}`))) return 90;
  if (SUSPICIOUS_MARKERS.some((marker) => value.includes(marker))) return 15;
  if (value.endsWith('.gov') || value.endsWith('.gov.in') || value.endsWith('.edu')) return 88;
  if (value.endsWith('.org')) return 68;
  if (value.endsWith('.com') || value.endsWith('.co.uk') || value.endsWith('.in')) return 55;
  return 45;
};

const categoryForScore = (score) => score >= 80 ? 'trusted' : score >= 55 ? 'moderate' : score >= 30 ? 'suspicious' : 'unreliable';

const evaluateSources = async (sources) => {
  const evaluated = (sources || []).map((source) => {
    const score = domainScore(source.source_domain);
    return {
      ...source,
      credibility_score: score,
      credibility_category: categoryForScore(score),
      should_use: score >= 45,
    };
  });

  const trusted = evaluated.filter((item) => item.credibility_category === 'trusted');
  const suspicious = evaluated.filter((item) => ['suspicious', 'unreliable'].includes(item.credibility_category));

  return {
    evaluated_sources: evaluated,
    trusted_sources: trusted.map((item) => item.url).filter(Boolean),
    suspicious_sources: suspicious.map((item) => item.url).filter(Boolean),
    moderate_sources: evaluated.filter((item) => item.credibility_category === 'moderate').map((item) => item.url).filter(Boolean),
    unreliable_sources: evaluated.filter((item) => item.credibility_category === 'unreliable').map((item) => item.url).filter(Boolean),
    overall_evidence_quality: trusted.length >= 3 ? 'strong' : evaluated.length >= 3 ? 'moderate' : evaluated.length ? 'weak' : 'insufficient',
  };
};

const refineWithLLM = async (claim, evaluation) => {
  if (!evaluation.evaluated_sources.length) return evaluation;

  const system = `You are a source-review assistant. Given a factual claim and a list of web sources with deterministic credibility scores, identify which sources are most relevant and whether the evidence is mixed, supporting, contradicting, or unclear. Keep the underlying URLs unchanged. Return JSON: {"selected_urls":[],"evidence_consensus":"supporting|contradicting|mixed|no_consensus"}.`;
  const user = `Claim: ${claim}\nSources:\n${evaluation.evaluated_sources.slice(0, 15).map((source, index) => `${index + 1}. ${source.title} | ${source.url} | ${source.snippet}`).join('\n')}`;

  const result = await generateText({ system, user, json: true });
  const parsed = result ? parseModelJson(result.text) : null;
  if (!parsed) return { ...evaluation, evidence_consensus: 'no_consensus' };

  const selected = new Set(Array.isArray(parsed.selected_urls) ? parsed.selected_urls : []);
  const usable = evaluation.evaluated_sources.filter((source) => !selected.size || selected.has(source.url) || source.credibility_score >= 80);
  return { ...evaluation, evaluated_sources: usable, evidence_consensus: parsed.evidence_consensus || 'no_consensus' };
};

module.exports = { evaluateSources, refineWithLLM, domainScore, categoryForScore };
