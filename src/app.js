// Express Application Factory (imported by both src/server.js and Jest/Supertest suite)
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');

const config = require('./config');
const { requestCorrelation, errorHandler } = require('./middleware/errorHandler');
const authRoutes = require('./routes/auth');
const jobRoutes = require('./routes/jobs');
const agentRoutes = require('./routes/agents');
const systemRoutes = require('./routes/system');

function createApp() {
  const app = express();

  app.set('trust proxy', 1);

  // Security headers configured to allow live iframe preview embedding & CDN assets
  app.use(helmet({
    frameguard: false,
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));

  app.use(cors({
    origin: true,
    credentials: true,
    exposedHeaders: ['X-Request-Id', 'X-Idempotent-Replay', 'Idempotency-Key'],
  }));

  app.use(requestCorrelation);
  app.use(express.json({ limit: '256kb' }));

  if (config.env !== 'test') {
    app.use('/api/', rateLimit({
      windowMs: config.security.rateLimitWindowMs,
      max: config.security.rateLimitMax,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many requests, please retry shortly.', code: 'RATE_LIMITED' },
    }));
  }

  // OpenAPI 3.0 Spec + Interactive Swagger UI
  const openapiDoc = YAML.load(path.join(__dirname, '..', 'docs', 'openapi.yaml'));
  app.get('/api/openapi.json', (_req, res) => res.json(openapiDoc));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapiDoc, {
    customSiteTitle: 'TrustSettle AI — PayPal Escrow API Docs',
  }));

  // Mount API routers (agentRoutes first so /api/jobs/agent matches before /api/jobs/:id)
  app.use('/api/auth', authRoutes);
  app.use('/api', agentRoutes);
  app.use('/api/jobs', jobRoutes);
  app.use('/api', systemRoutes);

  // Static Frontend + Merchant SDK
  const publicDir = path.join(__dirname, '..', 'public');
  app.use(express.static(publicDir));

  // API 404 vs SPA fallback
  app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: `API route not found: ${req.method} ${req.path}`, code: 'NOT_FOUND' });
    }
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  app.use(errorHandler);
  return app;
}

module.exports = createApp;
