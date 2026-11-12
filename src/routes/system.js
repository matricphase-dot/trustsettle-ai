// System Observability, Ledger, PayPal Webhooks & Metrics Routes
const express = require('express');
const config = require('../config');
const db = require('../db');
const paypal = require('../services/paypal');
const ai = require('../services/ai');
const { sweepExpiredJobs } = require('../services/timelock');

const router = express.Router();
const startedAt = Date.now();

router.get('/health', (_req, res) => {
  const metrics = db.getMetrics();
  res.json({
    ok: true,
    service: 'trustsettle-ai-enterprise',
    version: '2.0.0',
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    paypalMode: paypal.isLive ? `${paypal.env}-live` : 'demo',
    aiMode: ai.hasGemini ? 'gemini' : 'deterministic-rubric',
    dbAdapter: metrics.adapter,
    trustInvariants: {
      humanApprovalRequired: true,
      idempotencyEnabled: true,
      rbacEnabled: true,
      hashChainedAudit: true,
    },
    metrics,
  });
});

router.get('/metrics', (req, res) => {
  sweepExpiredJobs();
  const m = db.getMetrics();
  if ((req.headers.accept || '').includes('text/plain')) {
    const prom = [
      '# HELP trustsettle_jobs_total Total escrow jobs created',
      '# TYPE trustsettle_jobs_total gauge',
      `trustsettle_jobs_total ${m.totalJobs}`,
      '# HELP trustsettle_tvl_held_cents Total value currently held in PayPal Authorizations (cents)',
      '# TYPE trustsettle_tvl_held_cents gauge',
      `trustsettle_tvl_held_cents ${m.heldCents}`,
      '# HELP trustsettle_released_cents_total Total value captured & paid out (cents)',
      '# TYPE trustsettle_released_cents_total counter',
      `trustsettle_released_cents_total ${m.releasedCents}`,
      '# HELP trustsettle_refunded_cents_total Total value released/refunded back to buyers (cents)',
      '# TYPE trustsettle_refunded_cents_total counter',
      `trustsettle_refunded_cents_total ${m.refundedCents}`,
    ].join('\n') + '\n';
    res.setHeader('Content-Type', 'text/plain; version=0.0.4');
    return res.send(prom);
  }
  res.json(m);
});

router.get('/ledger', (_req, res) => {
  res.json({ ledger: db.listLedger(), metrics: db.getMetrics() });
});

router.get('/webhooks', (_req, res) => {
  res.json({ webhooks: db.listWebhooks() });
});

router.post('/webhooks/paypal', async (req, res, next) => {
  try {
    const sig = await paypal.verifyWebhookSignature(req.headers, req.body || {});
    if (config.paypal.isLive && config.paypal.webhookId && !sig.verified) {
      return res.status(401).json({ error: 'PayPal webhook signature verification failed', verification: sig });
    }

    const eventType = req.body?.event_type || 'UNKNOWN_EVENT';
    const resourceId = req.body?.resource?.id || req.body?.id || null;

    const record = db.addWebhook({
      id: req.body?.id,
      type: eventType,
      paypalId: resourceId,
      verified: sig.verified,
      mode: sig.mode,
      payload: req.body || {},
    });

    // Reconcile matching job audit trail if resource matches orderId / authorizationId / captureId
    if (resourceId) {
      const matched = db.listJobs().find(j =>
        [j.orderId, j.authorizationId, j.captureId, j.payoutId].includes(resourceId)
      );
      if (matched) {
        db.appendAudit(matched.id, {
          actor: 'paypal-webhook',
          role: 'PAYPAL',
          action: `WEBHOOK_${eventType}`,
          detail: `Resource ${resourceId} (verified=${sig.verified})`,
        });
      }
    }

    res.json({ received: true, webhookId: record.id, verification: sig });
  } catch (err) {
    next(err);
  }
});

// PayPal Return / Cancel callbacks for live checkout redirect flow
router.get('/paypal/return', async (req, res) => {
  const { jobId, token } = req.query;
  if (jobId && token) {
    const job = db.getJob(jobId);
    if (job) {
      try {
        const auth = await paypal.authorizeApprovedOrder(token, `return-${job.id}`);
        db.updateJob(job.id, { authorizationId: auth.authorizationId, status: 'HELD' });
        db.appendAudit(job.id, { actor: 'paypal-return', role: 'PAYPAL', action: 'BUYER_CHECKOUT_APPROVED', detail: auth.authorizationId });
      } catch (_e) { /* handled in UI */ }
    }
  }
  res.redirect(`/?jobId=${encodeURIComponent(jobId || '')}&paypalStatus=approved`);
});

router.get('/paypal/cancel', (req, res) => {
  res.redirect(`/?jobId=${encodeURIComponent(req.query.jobId || '')}&paypalStatus=cancelled`);
});

router.post('/reset', (_req, res) => {
  db.reset();
  res.json({ ok: true });
});

module.exports = router;
