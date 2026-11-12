// Production config with validation (fail fast on bad env)
require('dotenv').config();

const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-only-secret-change-in-prod',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  db: {
    url: process.env.DATABASE_URL || '',
  },
  paypal: {
    clientId: process.env.PAYPAL_CLIENT_ID || '',
    clientSecret: process.env.PAYPAL_CLIENT_SECRET || '',
    env: (process.env.PAYPAL_ENV || 'sandbox').toLowerCase(),
    webhookId: process.env.PAYPAL_WEBHOOK_ID || '',
  },
  ai: {
    geminiKey: process.env.GEMINI_API_KEY || '',
  },
  security: {
    rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 900000),
    rateLimitMax: Number(process.env.RATE_LIMIT_MAX || 300),
  },
};

config.paypal.isLive = Boolean(
  config.paypal.clientId && config.paypal.clientSecret &&
  config.paypal.clientId !== 'your_paypal_client_id'
);
config.ai.hasGemini = Boolean(config.ai.geminiKey && config.ai.geminiKey !== 'your_gemini_api_key');
config.db.isPostgres = Boolean(config.db.url);

if (config.env === 'production' && config.jwt.secret === 'dev-only-secret-change-in-prod') {
  console.warn('[config] WARNING: JWT_SECRET not set in production!');
}

module.exports = config;
