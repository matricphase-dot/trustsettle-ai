// Structured production logger (Pino) with redaction for sensitive tokens
const pino = require('pino');
const config = require('../config');

const isTest = config.env === 'test' || process.env.JEST_WORKER_ID !== undefined;

const logger = pino({
  level: isTest ? 'silent' : (process.env.LOG_LEVEL || 'info'),
  redact: {
    paths: ['req.headers.authorization', 'req.headers["x-api-key"]', 'clientSecret', 'password', 'token'],
    censor: '[REDACTED]',
  },
  base: {
    service: 'trustsettle-ai',
    version: '2.0.0',
    env: config.env,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

module.exports = logger;
