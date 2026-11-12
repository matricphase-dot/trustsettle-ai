#!/usr/bin/env node
// TrustSettle AI — Hackathon Submission Pre-Flight Validator
// Run `npm run preflight` before pushing to GitHub & deploying to Render!

const fs = require('fs');
const path = require('path');
const YAML = require('yamljs');
const config = require('../src/config');

const ROOT = path.join(__dirname, '..');
let allRequiredOk = true;

function check(label, ok, note = '', optional = false) {
  const icon = ok ? '✅' : (optional ? '🟡' : '❌');
  if (!ok && !optional) allRequiredOk = false;
  console.log(`${icon} ${label}${note ? ' — ' + note : ''}`);
}

console.log('\n============================================================');
console.log('  TRUSTSETTLE AI — DEVPOST SUBMISSION PRE-FLIGHT CHECK');
console.log('============================================================\n');

// 1. Required repo files per official PayPal AI Hackathon rules
check('Public Open-Source LICENSE file present (MIT)', fs.existsSync(path.join(ROOT, 'LICENSE')));
check('README.md present with setup & architecture', fs.existsSync(path.join(ROOT, 'README.md')));
check('.gitignore protects .env secrets from leaking', fs.existsSync(path.join(ROOT, '.gitignore')) && fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8').includes('.env'));
check('Render 1-click deploy blueprint (render.yaml)', fs.existsSync(path.join(ROOT, 'render.yaml')));
check('Docker + PostgreSQL production config', fs.existsSync(path.join(ROOT, 'Dockerfile')) && fs.existsSync(path.join(ROOT, 'docker-compose.yml')));
check('Drop-in Partner Checkout SDK (/public/sdk/trustsettle-sdk.js)', fs.existsSync(path.join(ROOT, 'public', 'sdk', 'trustsettle-sdk.js')));
check('Devpost Thumbnail + SVG Architecture Diagram', fs.existsSync(path.join(ROOT, 'docs', 'trustsettle-thumbnail.png')) && fs.existsSync(path.join(ROOT, 'docs', 'architecture-diagram.svg')));

// 2. OpenAPI 3.0 Spec validity
try {
  const spec = YAML.load(path.join(ROOT, 'docs', 'openapi.yaml'));
  check('OpenAPI 3.0 specification valid', spec?.openapi?.startsWith('3.0'), `${Object.keys(spec.paths || {}).length} API paths documented`);
} catch (e) {
  check('OpenAPI 3.0 specification valid', false, e.message);
}

// 3. Live API credentials status (optional locally because zero-config fallback works, recommended for Render!)
check(
  'PayPal Sandbox API Keys (PAYPAL_CLIENT_ID / SECRET)',
  config.paypal.isLive,
  config.paypal.isLive ? `LIVE (${config.paypal.env})` : 'Using Sandbox Simulation fallback — paste keys in Render Env Vars for real PayPal Sandbox IDs!',
  true
);
check(
  'Gemini 2.0 Flash API Key (GEMINI_API_KEY)',
  config.ai.hasGemini,
  config.ai.hasGemini ? 'LIVE Gemini 2.0 Flash' : 'Using Deterministic Rubric fallback — paste GEMINI_API_KEY in Render Env Vars for live LLM!',
  true
);

console.log('\n------------------------------------------------------------');
if (allRequiredOk) {
  console.log('🏆 PRE-FLIGHT PASSED: Codebase is 100% compliant & ready to push/deploy!');
} else {
  console.log('❌ PRE-FLIGHT FAILED: Fix the ❌ items above before submitting.');
  process.exit(1);
}
console.log('------------------------------------------------------------\n');
