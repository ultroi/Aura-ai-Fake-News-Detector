require('dotenv').config();

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toFloat = (value, fallback) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const list = (value, fallback) => {
  const values = String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return values.length ? values : fallback;
};

const deploymentOrigins = [
  process.env.FRONTEND_URL,
  process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`,
  process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`,
].filter(Boolean);
const configuredCorsOrigins = String(process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const corsOrigins = [...new Set([
  ...deploymentOrigins,
  ...configuredCorsOrigins,
  'http://localhost:5173',
  'http://localhost:3000',
])];

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: toInt(process.env.PORT, 5000),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  corsOrigins,
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/aura-ai',
  jwtSecret: process.env.JWT_SECRET || 'development-only-secret-change-me',
  jwtExpire: process.env.JWT_EXPIRE || '7d',
  cookieName: process.env.COOKIE_NAME || 'token',
  cookieSameSite: String(process.env.COOKIE_SAME_SITE || 'lax').toLowerCase(),
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',

  groqApiKey: process.env.GROQ_API_KEY || '',
  groqModel: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  llmTemperature: toFloat(process.env.LLM_TEMPERATURE, 0.2),
  llmMaxTokens: toInt(process.env.LLM_MAX_TOKENS, 1800),
  llmTimeoutMs: toInt(process.env.LLM_TIMEOUT_MS, 30000),

  tavilyApiKey: process.env.TAVILY_API_KEY || '',
  tavilySearchDepth: process.env.TAVILY_SEARCH_DEPTH || 'advanced',
  tavilyMaxResults: toInt(process.env.TAVILY_MAX_RESULTS, 3),

  maxQueryLength: toInt(process.env.MAX_QUERY_LENGTH, 2000),
  maxImages: toInt(process.env.MAX_IMAGES, 5),
  maxClaims: toInt(process.env.MAX_CLAIMS, 5),
  maxSearchResults: toInt(process.env.MAX_SEARCH_RESULTS, 20),
  maxUrlContent: toInt(process.env.MAX_URL_CONTENT, 50000),

  emailHost: process.env.EMAIL_HOST || '',
  emailPort: toInt(process.env.EMAIL_PORT, 587),
  emailSecure: String(process.env.EMAIL_SECURE || 'false').toLowerCase() === 'true',
  emailUser: process.env.EMAIL_USER || '',
  emailPassword: process.env.EMAIL_PASSWORD || '',
  supportEmail: process.env.SUPPORT_EMAIL || process.env.EMAIL_USER || '',
};

const validateRuntimeConfig = () => {
  const warnings = [];
  if (env.jwtSecret === 'development-only-secret-change-me') warnings.push('JWT_SECRET');
  if (!env.mongoUri) warnings.push('MONGODB_URI');
  if (!env.groqApiKey && !env.geminiApiKey) warnings.push('GROQ_API_KEY or GEMINI_API_KEY');
  if (!env.tavilyApiKey) warnings.push('TAVILY_API_KEY');

  if (env.nodeEnv === 'production') {
    const missing = [];
    if (!process.env.MONGODB_URI) missing.push('MONGODB_URI');
    if (!process.env.JWT_SECRET || env.jwtSecret === 'development-only-secret-change-me') missing.push('JWT_SECRET');
    if (!env.groqApiKey && !env.geminiApiKey) missing.push('GROQ_API_KEY or GEMINI_API_KEY');
    if (!env.tavilyApiKey) missing.push('TAVILY_API_KEY');
    if (missing.length) throw new Error(`Missing production configuration: ${missing.join(', ')}`);
  }

  if (warnings.length) {
    console.warn(`[config] Optional/development configuration missing: ${warnings.join(', ')}`);
  }
};

module.exports = { env, validateRuntimeConfig };
