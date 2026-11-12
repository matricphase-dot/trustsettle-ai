// Enterprise Auth & Partner API Key Routes
const express = require('express');
const { z } = require('zod');
const db = require('../db');
const validate = require('../middleware/validate');
const { signUserToken, authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

const tokenSchema = z.object({
  email: z.string().email().optional(),
  role: z.enum(['CLIENT', 'FREELANCER', 'AGENT', 'ARBITRATOR', 'MERCHANT_ADMIN']).optional(),
});

const apiKeySchema = z.object({
  merchantName: z.string().min(2).max(120),
  scopes: z.array(z.string()).optional(),
});

router.get('/personas', (_req, res) => {
  res.json({
    personas: db.listUsers(),
    defaultSandboxApiKey: 'ts_test_paypal_hackathon_2026',
  });
});

router.post('/token', validate(tokenSchema), (req, res) => {
  const { email, role } = req.validated;
  let user = email ? db.getUserByEmail(email) : null;
  if (!user && role) {
    user = db.listUsers().find(u => u.role === role);
  }
  if (!user) {
    user = {
      id: `USR-${role || 'CLIENT'}-TEMP`,
      email: email || 'buyer@sandbox.paypal.com',
      name: `${role || 'CLIENT'} Session`,
      role: role || 'CLIENT',
    };
  }
  const token = signUserToken(user);
  res.json({
    token,
    tokenType: 'Bearer',
    user,
  });
});

router.get('/me', authenticate, (req, res) => {
  res.json({ actor: req.actor });
});

router.post('/api-keys', authenticate, requireRole(['MERCHANT_ADMIN']), validate(apiKeySchema), (req, res) => {
  const created = db.createMerchantApiKey(req.validated.merchantName, req.validated.scopes);
  res.status(201).json({
    id: created.id,
    merchantName: created.merchantName,
    keyPrefix: created.keyPrefix,
    apiKey: created.rawKey, // Shown once at creation
    scopes: created.scopes,
    createdAt: created.createdAt,
  });
});

module.exports = router;
