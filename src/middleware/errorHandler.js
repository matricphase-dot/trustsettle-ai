// Request Correlation ID & Centralized Production Error Handler
const crypto = require('crypto');
const logger = require('../utils/logger');

function requestCorrelation(req, res, next) {
  const reqId = req.headers['x-request-id'] || `req_${crypto.randomBytes(6).toString('hex')}`;
  req.requestId = reqId;
  res.setHeader('X-Request-Id', reqId);
  next();
}

function errorHandler(err, req, res, _next) {
  const status = err.statusCode || err.status || 500;
  logger.error({
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl,
    status,
    err: err.message,
  }, 'Unhandled API error');

  res.status(status).json({
    error: err.message || 'Internal Server Error',
    code: err.code || (status === 500 ? 'INTERNAL_ERROR' : 'API_ERROR'),
    requestId: req.requestId,
  });
}

module.exports = { requestCorrelation, errorHandler };
