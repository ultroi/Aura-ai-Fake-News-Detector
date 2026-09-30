const { generateText } = require('./llmClient');
const { parseModelJson } = require('../utils/json');

const detectLanguage = (text) => {
  const value = String(text || '');
  const devanagari = (value.match(/[\u0900-\u097F]/g) || []).length;
  if (devanagari > 2) return 'hi';
  const hinglishMarkers = /\b(kya|hai|hain|nahi|nahin|ka|ki|ke|ko|se|mein|me|aur|par|yeh|woh|sach|jhooth|karo|karna)\b/i;
  if (hinglishMarkers.test(value)) return 'hinglish';
  return 'en';
};

const normalize = (result, input, language) => {
  const claims = Array.isArray(result?.claims) ? result.claims : [];
  const normalizedClaims = claims.slice(0, 5).map((claim, index) => ({
    id: claim.id || `c${index + 1}`,
    claim: String(claim.claim || claim.text || '').trim(),
    subject: String(claim.subject || '').trim(),
    type: String(claim.type || 'factual').trim(),
  })).filter((claim) => claim.claim);

  return {
    language: result?.language || language,
    main_claim: String(result?.main_claim || normalizedClaims[0]?.claim || input).trim(),
    claims: normalizedClaims.length ? normalizedClaims : [{ id: 'c1', claim: input.trim(), subject: '', type: 'factual' }],
    entities: Array.isArray(result?.entities) ? result.entities.map(String).slice(0, 20) : [],
    dates: Array.isArray(result?.dates) ? result.dates.map(String).slice(0, 20) : [],
    locations: Array.isArray(result?.locations) ? result.locations.map(String).slice(0, 20) : [],
    translated_claim: result?.translated_claim ? String(result.translated_claim) : input,
  };
};

const fallback = (input, language) => ({
  language,
  main_claim: input.trim(),
  claims: [{ id: 'c1', claim: input.trim(), subject: '', type: 'factual' }],
  entities: [],
  dates: (input.match(/\b(?:19|20)\d{2}\b/g) || []).slice(0, 10),
  locations: [],
  translated_claim: input.trim(),
});

const extractClaims = async (input) => {
  const language = detectLanguage(input);
  const system = `You are Aura AI's claim extraction engine. Extract factual claims from user input for a verification pipeline. Return strict JSON with: language, main_claim, translated_claim, claims (id, claim, subject, type), entities, dates, locations. Do not invent facts. Keep claims concise.`;
  const user = `Language hint: ${language}\nInput:\n${input}`;

  const result = await generateText({ system, user, json: true });
  if (!result) return fallback(input, language);

  const parsed = parseModelJson(result.text);
  return parsed ? normalize(parsed, input, language) : fallback(input, language);
};

module.exports = { extractClaims, detectLanguage };
