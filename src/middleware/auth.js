// Enterprise Authentication & Role-Based Access Control (RBAC)
// Supports:
//  1. JWT Bearer Token (Authorization: Bearer <jwt>)
//  2. Merchant Partner API Key (X-API-Key: ts_live_... / ts_test_...)
//  3. Interactive Persona / Demo Session fallback (unless STRICT_AUTH=true)

const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db');

function signUserToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn, issuer: 'trustsettle-ai' }
  );
}

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const apiKeyHeader = req.headers['x-api-key'];
  const demoRoleHeader = req.headers['x-actor-role'];

  // 1. Merchant Partner API Key
  if (apiKeyHeader) {
    const keyRecord = db.verifyMerchantApiKey(apiKeyHeader);
    if (!keyRecord) {
      return res.status(401).json({ error: 'Invalid or revoked X-API-Key', code: 'INVALID_API_KEY' });
    }
    req.actor = {
      id: keyRecord.id,
      email: 'merchant-api@partner.paypal.com',
      name: keyRecord.merchantName,
      role: 'MERCHANT_ADMIN',
      authMethod: 'api_key',
      scopes: keyRecord.scopes,
    };
    return next();
  }

  // 2. JWT Bearer Token
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    try {
      const payload = jwt.verify(token, config.jwt.secret);
      req.actor = {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
        role: payload.role,
        authMethod: 'jwt',
      };
      return next();
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired Bearer JWT token', code: 'INVALID_JWT' });
    }
  }

  // 3. Strict mode check for locked-down production deployments
  if (process.env.STRICT_AUTH === 'true') {
    return res.status(401).json({
      error: 'Authentication required. Provide Authorization: Bearer <jwt> or X-API-Key.',
      code: 'AUTH_REQUIRED',
    });
  }

  // 4. Interactive Sandbox Session (allows browser UI & PayPal sandbox reviewers to test seamlessly,
  // while still honoring X-Actor-Role to demonstrate live RBAC enforcement!)
  const role = ['CLIENT', 'FREELANCER', 'AGENT', 'ARBITRATOR', 'MERCHANT_ADMIN'].includes(demoRoleHeader)
    ? demoRoleHeader
    : null;

  req.actor = {
    id: role ? `DEMO-${role}` : 'SESSION-INTERACTIVE',
    email: role === 'FREELANCER' ? 'freelancer@sandbox.paypal.com' : 'buyer@sandbox.paypal.com',
    name: role ? `Sandbox ${role}` : 'Interactive Session',
    // When no explicit token/role header is sent, allow full interactive flow; when a role IS chosen, enforce RBAC strictly!
    role: role || 'INTERACTIVE_SANDBOX',
    authMethod: 'sandbox_session',
  };
  next();
}

function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.actor) {
      return res.status(401).json({ error: 'Unauthenticated', code: 'AUTH_REQUIRED' });
    }
    // MERCHANT_ADMIN and default INTERACTIVE_SANDBOX pass unless testing explicit persona RBAC
    if (req.actor.role === 'MERCHANT_ADMIN' || req.actor.role === 'INTERACTIVE_SANDBOX') {
      return next();
    }
    if (!allowedRoles.includes(req.actor.role)) {
      return res.status(403).json({
        error: `Forbidden: Role ${req.actor.role} is not permitted for this escrow action. Allowed: ${allowedRoles.join(', ')}`,
        code: 'RBAC_FORBIDDEN',
        actorRole: req.actor.role,
        allowedRoles,
      });
    }
    next();
  };
}

module.exports = { signUserToken, authenticate, requireRole };
