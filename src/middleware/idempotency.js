// Idempotency-Key middleware for money-moving endpoints (prevents double-charging & double-payouts)
const db = require('../db');

function idempotency(req, res, next) {
  const rawKey = req.headers['idempotency-key'] || req.headers['paypal-request-id'];
  if (!rawKey) return next();

  const scopedKey = `${req.method}:${req.originalUrl}:${String(rawKey).trim()}`;
  const cached = db.getIdempotency(scopedKey);
  if (cached) {
    res.setHeader('X-Idempotent-Replay', 'true');
    res.setHeader('Idempotency-Key', String(rawKey).trim());
    return res.status(cached.statusCode).json(cached.responseBody);
  }

  req.idempotencyKey = String(rawKey).trim();
  const origJson = res.json.bind(res);
  res.json = (body) => {
    // Only cache 2xx deterministic financial outcomes
    if (res.statusCode >= 200 && res.statusCode < 300) {
      db.setIdempotency(scopedKey, {
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        responseBody: body,
      });
    }
    res.setHeader('X-Idempotent-Replay', 'false');
    res.setHeader('Idempotency-Key', req.idempotencyKey);
    return origJson(body);
  };
  next();
}

module.exports = idempotency;
