require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const cors = require('cors');

const { connectDB } = require('./config/database');
const { validateEnv } = require('./config/env');
const authRoutes = require('./routes/authRoutes');
const errorHandler = require('./middleware/errorHandler');
const {
  globalLimiter,
  authLimiter,
} = require('./middleware/rateLimiter');

// Initialize Express app
const app = express();

// Validate environment variables
validateEnv();

// Trust proxy (for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// ==================== MIDDLEWARE ====================

// Security middleware with stricter defaults
const helmetOptions = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", process.env.FRONTEND_URL || 'http://localhost:3000'],
      imgSrc: ["'self'", 'data:', 'https:'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      frameAncestors: ["'none'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
  },
};

app.use(helmet(helmetOptions));

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    const allowedOrigins = [process.env.FRONTEND_URL || 'http://localhost:3000', 'http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002', 'http://localhost:5173', 'http://127.0.0.1:3000', 'http://127.0.0.1:3001', 'http://127.0.0.1:3002', 'http://127.0.0.1:5173'];

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));

// Body parsing
// Support requests may include base64-encoded media attachments, so keep this generous.
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ limit: '25mb', extended: true }));

// Cookie parsing
app.use(cookieParser());

// Global rate limiter
app.use(globalLimiter);

// ==================== ROUTES ====================

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Aura AI Auth Backend',
    timestamp: new Date().toISOString(),
  });
});

// API info endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Aura AI Authentication API',
    version: '1.0.0',
    endpoints: {
      'POST /auth/google': 'Google OAuth login',
      'POST /auth/email-login': 'Authenticate with email and password',
      'GET /auth/me': 'Get current user (protected)',
      'POST /auth/logout': 'Logout user',
      'POST /auth/support': 'Submit help/support request',
    },
  });
});

// Auth routes with rate limiters
app.use('/auth', authLimiter);
app.use('/auth', authRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      message: 'Route not found',
    },
  });
});

// Error handler (must be last)
app.use(errorHandler);

// ==================== START SERVER ====================

const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';

const startServer = async () => {
  try {
    // Connect to database
    await connectDB();

    // Start Express server
    const server = app.listen(PORT, () => {
      console.log(`
╔════════════════════════════════════════╗
║   Aura AI Authentication Backend       ║
║   ${NODE_ENV.toUpperCase().padEnd(35)}║
╚════════════════════════════════════════╝

✓ Server running on http://localhost:${PORT}
✓ Environment: ${NODE_ENV}
✓ Frontend: ${process.env.FRONTEND_URL || 'http://localhost:3000'}

Available endpoints:
  POST   /auth/google        - Google OAuth login
  POST   /auth/email-login   - Authenticate with email and password
  GET    /auth/me            - Get current user
  POST   /auth/logout        - Logout user
  POST   /auth/support       - Submit support request
  GET    /health             - Health check
`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit - just log the error
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't exit - just log the error
});

module.exports = app;
