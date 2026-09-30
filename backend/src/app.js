const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { env } = require('./config/env');
const { globalLimiter, authLimiter } = require('./middleware/rateLimiter');
const authRoutes = require('./routes/authRoutes');
const analysisRoutes = require('./routes/analysisRoutes');
const errorHandler = require('./middleware/errorHandler');
const { failure } = require('./utils/response');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(cookieParser());
app.use(globalLimiter);

app.get('/health', (_req, res) => res.json({
  status: 'healthy',
  service: 'Aura AI MERN Backend',
  timestamp: new Date().toISOString(),
}));

app.get('/', (_req, res) => res.json({
  message: 'Aura AI - MERN API',
  version: '2.0.0',
  endpoints: {
    analysis: 'POST /analyze',
    analysisHistory: 'GET /analyze/history',
    googleLogin: 'POST /auth/google',
    emailLogin: 'POST /auth/email-login',
    me: 'GET /auth/me',
    profile: 'PATCH /auth/profile',
    logout: 'POST /auth/logout',
    support: 'POST /auth/support',
    health: 'GET /health',
  },
}));

app.use('/auth', authLimiter, authRoutes);
app.use('/analyze', analysisRoutes);

app.use((req, res) => failure(res, 404, `Route not found: ${req.method} ${req.originalUrl}`));
app.use(errorHandler);

module.exports = app;
