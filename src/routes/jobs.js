// Core Escrow Job Lifecycle Routes — Production State Machine + PayPal v2 + RBAC + Idempotency
const express = require('express');
const { z } = require('zod');
const db = require('../db');
const paypal = require('../services/paypal');
const ai = require('../services/ai');
const validate = require('../middleware/validate');
const idempotency = require('../middleware/idempotency');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

const createJobSchema = z.object({
  title: z.string().min(3).max(200),
  brief: z.string().min(10).max(5000),
  budget: z.coerce.number().min(1).max(1000000),
  currency: z.string().length(3).optional().default('USD'),
  clientEmail: z.string().email().optional(),
  freelancerEmail: z.string().email().optional(),
  slaHours: z.coerce.number().min(1).max(720).optional().default(48),
});

const deliverSchema = z.object({
  delivery: z.string().min(3).max(6000),
});

const reasonSchema = z.object({
  reason: z.string().min(5, 'Detailed reason (≥5 chars) is mandatory to prevent silent rating abuse').max(1000),
});

function formatJob(job) {
  if (!job) return null;
  const chainCheck = db.verifyAuditChain(job.auditTrail || []);
  return {
    ...job,
    heldAmount: db.toDollars(job.heldCents),
    releasedAmount: db.toDollars(job.releasedCents),
    refundedAmount: db.toDollars(job.refundedCents),
    auditIntegrity: {
      valid: chainCheck.valid,
      eventsCount: chainCheck.eventsVerified || (job.auditTrail || []).length,
      headHash: chainCheck.headHash || 'GENESIS',
    },
  };
}

router.get('/', authenticate, (req, res) => {
  const jobs = db.listJobs({ status: req.query.status, mode: req.query.mode }).map(formatJob);
  res.json({ jobs, count: jobs.length });
});

router.get('/:id', authenticate, (req, res) => {
  const job = db.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found', code: 'JOB_NOT_FOUND' });
  res.json({ job: formatJob(job) });
});

// 1. Create Escrow Contract
router.post('/', authenticate, requireRole(['CLIENT', 'MERCHANT_ADMIN']), validate(createJobSchema), (req, res) => {
  const job = db.createJob({
    ...req.validated,
    clientId: req.actor.id,
  });
  db.appendAudit(job.id, {
    actor: req.actor.email,
    role: req.actor.role,
    action: 'JOB_CREATED',
    detail: `"${job.title}" — Budget $${job.budget} ${job.currency} (48h buyer review SLA)`,
  });
  res.status(201).json({ job: formatJob(db.getJob(job.id)) });
});

// 2. Fund Escrow via PayPal Orders v2 (intent: AUTHORIZE)
router.post('/:id/fund', authenticate, requireRole(['CLIENT', 'MERCHANT_ADMIN']), idempotency, async (req, res, next) => {
  try {
    const out = await db.withJobLock(req.params.id, async () => {
      const job = db.getJob(req.params.id);
      if (!job) return { status: 404, body: { error: 'Job not found', code: 'JOB_NOT_FOUND' } };
      if (job.status !== 'DRAFT') {
        return { status: 409, body: { error: `Cannot fund job in state ${job.status}`, code: 'INVALID_STATE' } };
      }

      const pp = await paypal.createAuthorizeOrder({
        amount: job.budget,
        currency: job.currency,
        jobId: job.id,
        title: job.title,
        idempotencyKey: req.idempotencyKey || `fund-${job.id}`,
      });

      const authorized = Boolean(pp.authorizationId && ['AUTHORIZED', 'CREATED'].includes(pp.status));
      if (!authorized && !pp.approveUrl) throw new Error('PayPal returned neither authorization nor buyer approval URL');
      const updated = db.updateJob(job.id, {
        orderId: pp.orderId,
        authorizationId: pp.authorizationId,
        approveUrl: pp.approveUrl,
        heldCents: authorized ? job.budgetCents : 0,
        status: authorized ? 'HELD' : 'AWAITING_PAYPAL_APPROVAL',
      });
      if (!authorized) {
        db.appendAudit(job.id, { actor: 'paypal-orders-v2', role: 'PAYPAL', action: 'BUYER_APPROVAL_REQUIRED', detail: `Order ${pp.orderId}; no funds authorized yet` });
        return { status: 200, body: { job: formatJob(db.getJob(job.id)), paypal: pp } };
      }
      db.addLedger({
        jobId: job.id,
        jobTitle: job.title,
        entryType: 'DEBIT_HOLD',
        event: 'Authorize (Hold)',
        amountCents: job.budgetCents,
        currency: job.currency,
        status: 'HELD',
        paypalId: pp.authorizationId || pp.orderId,
        mode: pp.mode,
        actor: req.actor.email,
      });

      db.appendAudit(job.id, {
        actor: 'paypal-orders-v2',
        role: 'PAYPAL',
        action: 'AUTHORIZATION_HELD',
        detail: `Order ${pp.orderId} / Auth ${pp.authorizationId || 'PENDING'} — $${job.budget} ${job.currency} locked (${pp.mode})`,
      });

      return { status: 200, body: { job: formatJob(updated), paypal: pp } };
    });
    res.status(out.status).json(out.body);
  } catch (err) {
    next(err);
  }
});

// 3. Freelancer / Agent Submits Deliverable
router.post('/:id/deliver', authenticate, requireRole(['FREELANCER', 'AGENT', 'MERCHANT_ADMIN']), validate(deliverSchema), async (req, res, next) => {
  try {
    const out = await db.withJobLock(req.params.id, async () => {
      const job = db.getJob(req.params.id);
      if (!job) return { status: 404, body: { error: 'Job not found', code: 'JOB_NOT_FOUND' } };
      if (!job.authorizationId || job.heldCents <= 0) return { status: 409, body: { error: 'PayPal authorization required before delivery', code: 'AUTHORIZATION_REQUIRED' } };
      if (!['HELD', 'REVISE', 'DELIVERED'].includes(job.status)) {
        return { status: 409, body: { error: `Escrow must be HELD or REVISE before delivery (current: ${job.status})`, code: 'INVALID_STATE' } };
      }

      const updated = db.updateJob(job.id, {
        delivery: req.validated.delivery,
        deliveryCount: (job.deliveryCount || 0) + 1,
        status: 'DELIVERED',
      });

      db.appendAudit(job.id, {
        actor: req.actor.email,
        role: req.actor.role,
        action: 'DELIVERY_SUBMITTED',
        detail: `Submission #${updated.deliveryCount} (${req.validated.delivery.length} chars, quarantined as untrusted input)`,
      });

      return { status: 200, body: { job: formatJob(updated) } };
    });
    res.status(out.status).json(out.body);
  } catch (err) {
    next(err);
  }
});

// 4. Run Multi-Agent AI Verification (NEVER auto-releases money)
router.post('/:id/verify', authenticate, async (req, res, next) => {
  try {
    const out = await db.withJobLock(req.params.id, async () => {
      const job = db.getJob(req.params.id);
      if (!job) return { status: 404, body: { error: 'Job not found', code: 'JOB_NOT_FOUND' } };
      if (!job.authorizationId || job.heldCents <= 0) return { status: 409, body: { error: 'PayPal authorization required', code: 'AUTHORIZATION_REQUIRED' } };
      if (!job.delivery) return { status: 400, body: { error: 'No delivery submitted yet', code: 'MISSING_DELIVERY' } };
      if (['RELEASED', 'SETTLED', 'VOIDED', 'REFUNDED'].includes(job.status)) {
        return { status: 409, body: { error: `Job already finalized (${job.status})`, code: 'ALREADY_FINALIZED' } };
      }

      const verification = await ai.verifyDelivery(job.brief, job.delivery);
      const nextStatus = verification.verdict === 'APPROVE' ? 'PENDING_APPROVAL' : 'REVISE';

      // Reset 48h review window from verification moment
      const now = new Date();
      const updated = db.updateJob(job.id, {
        verification,
        status: nextStatus,
        deadlineAt: new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString(),
        demoDeadlineAt: new Date(now.getTime() + 5 * 60 * 1000).toISOString(),
      });

      db.appendAudit(job.id, {
        actor: verification.audit.model,
        role: 'AI_VERIFIER',
        action: 'DELIVERY_VERIFIED',
        detail: `Score ${verification.scores.total}/100 | Confidence ${verification.confidence}% | Verdict ${verification.verdict} -> ${nextStatus} | Hash ${verification.audit.inputHash}`,
        metadata: {
          scores: verification.scores,
          confidence: verification.confidence,
          injectionDetected: verification.injectionDetected,
        },
      });

      return { status: 200, body: { job: formatJob(updated), verification } };
    });
    res.status(out.status).json(out.body);
  } catch (err) {
    next(err);
  }
});

// Hard block on legacy / unapproved auto-release
router.post('/:id/release', (_req, res) => {
  res.status(400).json({
    error: 'Direct auto-release is disabled by security policy. Use POST /api/jobs/:id/approve-release — human sign-off is mandatory.',
    code: 'HUMAN_APPROVAL_REQUIRED',
  });
});

// 5. Human-in-the-Loop Approval -> PayPal Authorization Capture + Freelancer Payout
router.post('/:id/approve-release', authenticate, requireRole(['CLIENT', 'ARBITRATOR', 'MERCHANT_ADMIN']), idempotency, async (req, res, next) => {
  try {
    const out = await db.withJobLock(req.params.id, async () => {
      const job = db.getJob(req.params.id);
      if (!job) return { status: 404, body: { error: 'Job not found', code: 'JOB_NOT_FOUND' } };
      if (!['PENDING_APPROVAL', 'ESCALATED'].includes(job.status)) {
        return {
          status: 409,
          body: {
            error: `Job must be in PENDING_APPROVAL or ESCALATED to release funds (current: ${job.status})`,
            code: 'INVALID_STATE',
          },
        };
      }

      if (!job.authorizationId || job.heldCents <= 0) return { status: 409, body: { error: 'PayPal authorization required before capture', code: 'AUTHORIZATION_REQUIRED' } };
      const capture = await paypal.captureAuthorization({
        authorizationId: job.authorizationId,
        orderId: job.orderId,
        amount: job.budget,
        currency: job.currency,
        finalCapture: true,
        idempotencyKey: req.idempotencyKey || `approve-cap-${job.id}`,
      });

      const payout = await paypal.createPayout({
        amount: job.budget,
        currency: job.currency,
        receiverEmail: job.freelancerEmail,
        jobId: job.id,
        note: `TrustSettle AI approved escrow payout: ${job.title}`,
        idempotencyKey: req.idempotencyKey || `approve-pay-${job.id}`,
      });

      const clientDecision = {
        decision: 'APPROVED',
        actor: req.actor.email,
        role: req.actor.role,
        decidedAt: new Date().toISOString(),
      };

      const updated = db.updateJob(job.id, {
        captureId: capture.captureId,
        payoutId: payout.payoutId,
        heldCents: 0,
        releasedCents: job.budgetCents,
        clientDecision,
        status: 'RELEASED',
      });

      if (job.mode === 'AGENT' && job.agentId) {
        db.incrementAgentStats(job.agentId);
      }

      db.addLedger({
        jobId: job.id,
        jobTitle: job.title,
        entryType: 'CREDIT_CAPTURE',
        event: 'Capture Authorization (Approved)',
        amountCents: job.budgetCents,
        currency: job.currency,
        status: 'CAPTURED',
        paypalId: capture.captureId,
        mode: capture.mode,
        actor: req.actor.email,
      });

      db.addLedger({
        jobId: job.id,
        jobTitle: job.title,
        entryType: 'DEBIT_PAYOUT',
        event: job.mode === 'AGENT' ? 'Payout to AI Agent' : 'Payout to Freelancer',
        amountCents: job.budgetCents,
        currency: job.currency,
        status: 'PAID',
        paypalId: payout.payoutId,
        mode: payout.mode,
        actor: req.actor.email,
      });

      db.appendAudit(job.id, {
        actor: req.actor.email,
        role: req.actor.role,
        action: 'HUMAN_APPROVED_RELEASE',
        detail: `Capture ${capture.captureId} + Payout ${payout.payoutId} ($${job.budget} ${job.currency})`,
      });

      return { status: 200, body: { job: formatJob(updated), capture, payout } };
    });
    res.status(out.status).json(out.body);
  } catch (err) {
    next(err);
  }
});

// 6. Client Rejects Release (Mandatory Reason — Anti-Abuse Logged)
router.post('/:id/reject-release', authenticate, requireRole(['CLIENT', 'MERCHANT_ADMIN']), validate(reasonSchema), async (req, res, next) => {
  try {
    const out = await db.withJobLock(req.params.id, async () => {
      const job = db.getJob(req.params.id);
      if (!job) return { status: 404, body: { error: 'Job not found', code: 'JOB_NOT_FOUND' } };
      if (!['PENDING_APPROVAL', 'DELIVERED', 'REVISE'].includes(job.status)) {
        return { status: 409, body: { error: `Cannot reject in state ${job.status}`, code: 'INVALID_STATE' } };
      }

      const clientDecision = {
        decision: 'REJECTED',
        reason: req.validated.reason,
        actor: req.actor.email,
        decidedAt: new Date().toISOString(),
      };

      const updated = db.updateJob(job.id, {
        clientDecision,
        status: 'REVISE',
      });

      db.appendAudit(job.id, {
        actor: req.actor.email,
        role: req.actor.role,
        action: 'HUMAN_REJECTED_WITH_REASON',
        detail: `Reason: "${req.validated.reason}". Funds ($${job.budget}) remain HELD in PayPal Authorization.`,
      });

      return { status: 200, body: { job: formatJob(updated), feedbackSent: req.validated.reason } };
    });
    res.status(out.status).json(out.body);
  } catch (err) {
    next(err);
  }
});

// 7. Send AI Revision Feedback (Funds Remain Held)
router.post('/:id/revise', authenticate, (req, res) => {
  const job = db.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found', code: 'JOB_NOT_FOUND' });
  const feedback = job.verification?.feedback || 'Please update deliverables to match brief requirements.';
  const updated = db.updateJob(job.id, { status: 'REVISE' });
  db.appendAudit(job.id, {
    actor: req.actor.email,
    role: req.actor.role,
    action: 'REVISION_REQUESTED',
    detail: feedback,
  });
  res.json({ job: formatJob(updated), feedback });
});

// 8. Void Authorization (Cancel before work delivered, 100% hold released back to buyer)
router.post('/:id/void', authenticate, requireRole(['CLIENT', 'ARBITRATOR', 'MERCHANT_ADMIN']), idempotency, validate(reasonSchema), async (req, res, next) => {
  try {
    const out = await db.withJobLock(req.params.id, async () => {
      const job = db.getJob(req.params.id);
      if (!job) return { status: 404, body: { error: 'Job not found', code: 'JOB_NOT_FOUND' } };
      if (job.status !== 'HELD' || job.delivery) {
        return {
          status: 409,
          body: {
            error: 'Authorization can only be voided before work is delivered. Use Smart Settlement after delivery to protect freelancer.',
            code: 'DELIVERY_EXISTS_USE_SETTLEMENT',
          },
        };
      }

      const voidRes = await paypal.voidAuthorization(job.authorizationId, req.idempotencyKey || `void-${job.id}`);
      const updated = db.updateJob(job.id, {
        heldCents: 0,
        refundedCents: job.budgetCents,
        status: 'VOIDED',
      });

      db.addLedger({
        jobId: job.id,
        jobTitle: job.title,
        entryType: 'VOID_HOLD',
        event: 'Void Authorization (Hold Released)',
        amountCents: job.budgetCents,
        currency: job.currency,
        status: 'REFUNDED',
        paypalId: voidRes.voidId,
        mode: voidRes.mode,
        actor: req.actor.email,
      });

      db.appendAudit(job.id, {
        actor: req.actor.email,
        role: req.actor.role,
        action: 'AUTHORIZATION_VOIDED',
        detail: `Reason: "${req.validated.reason}" — Hold released via ${voidRes.voidId}`,
      });

      return { status: 200, body: { job: formatJob(updated), void: voidRes } };
    });
    res.status(out.status).json(out.body);
  } catch (err) {
    next(err);
  }
});

// 9. Smart Settlement Proposal (AI Arbitrator Proportional Split)
router.post('/:id/settle-propose', authenticate, (req, res) => {
  const job = db.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found', code: 'JOB_NOT_FOUND' });
  if (!job.verification) return res.status(400).json({ error: 'Run AI verification first', code: 'VERIFICATION_REQUIRED' });
  if (['RELEASED', 'SETTLED', 'VOIDED'].includes(job.status)) {
    return res.status(409).json({ error: `Job already finalized (${job.status})`, code: 'ALREADY_FINALIZED' });
  }

  const proposal = ai.proposeSettlement(job.brief, job.delivery, job.verification, job.budget);
  const updated = db.updateJob(job.id, { settlement: proposal, status: 'SETTLEMENT_PROPOSED' });
  db.appendAudit(job.id, {
    actor: 'smart-settlement-arbitrator',
    role: 'AI_ARBITRATOR',
    action: 'SETTLEMENT_PROPOSED',
    detail: `Split: ${proposal.freelancerPct}% Freelancer ($${proposal.freelancerAmount}) / ${proposal.buyerRefundPct}% Buyer ($${proposal.refundAmount}) — ${proposal.reasoning}`,
  });

  res.json({ job: formatJob(updated), proposal });
});

// 10. Execute Smart Settlement via PayPal Partial Final Capture + Payout
router.post('/:id/settle-accept', authenticate, requireRole(['CLIENT', 'ARBITRATOR', 'MERCHANT_ADMIN']), idempotency, async (req, res, next) => {
  try {
    const out = await db.withJobLock(req.params.id, async () => {
      const job = db.getJob(req.params.id);
      if (!job) return { status: 404, body: { error: 'Job not found', code: 'JOB_NOT_FOUND' } };
      if (!job.settlement) {
        return { status: 400, body: { error: 'Call /settle-propose first', code: 'NO_PROPOSAL' } };
      }
      if (['RELEASED', 'SETTLED', 'VOIDED'].includes(job.status)) {
        return { status: 409, body: { error: `Job already finalized (${job.status})`, code: 'ALREADY_FINALIZED' } };
      }

      const s = job.settlement;
      // Partial final capture on Authorization: captures ONLY freelancerAmount and automatically releases refundAmount hold!
      if (!job.authorizationId || job.heldCents <= 0) return { status: 409, body: { error: 'PayPal authorization required before capture', code: 'AUTHORIZATION_REQUIRED' } };
      const capture = await paypal.captureAuthorization({
        authorizationId: job.authorizationId,
        orderId: job.orderId,
        amount: s.freelancerAmount,
        currency: job.currency,
        finalCapture: true,
        idempotencyKey: req.idempotencyKey || `settle-cap-${job.id}`,
      });

      const payout = await paypal.createPayout({
        amount: s.freelancerAmount,
        currency: job.currency,
        receiverEmail: job.freelancerEmail,
        jobId: job.id,
        note: `TrustSettle Smart Settlement (${s.freelancerPct}%): ${job.title}`,
        idempotencyKey: req.idempotencyKey || `settle-pay-${job.id}`,
      });

      const releaseRefId = `AUTH-RELEASE-${(job.authorizationId || job.orderId || 'SIM').slice(-8)}`;
      const updated = db.updateJob(job.id, {
        captureId: capture.captureId,
        payoutId: payout.payoutId,
        refundId: releaseRefId,
        heldCents: 0,
        releasedCents: s.freelancerCents,
        refundedCents: s.refundCents,
        settlement: { ...s, clientAccepted: true, settledAt: new Date().toISOString() },
        status: 'SETTLED',
      });

      db.addLedger({
        jobId: job.id,
        jobTitle: job.title,
        entryType: 'CREDIT_CAPTURE',
        event: `Partial Final Capture (${s.freelancerPct}%)`,
        amountCents: s.freelancerCents,
        currency: job.currency,
        status: 'CAPTURED',
        paypalId: capture.captureId,
        mode: capture.mode,
        actor: req.actor.email,
      });

      db.addLedger({
        jobId: job.id,
        jobTitle: job.title,
        entryType: 'DEBIT_PAYOUT',
        event: `Settlement Payout (${s.freelancerPct}%)`,
        amountCents: s.freelancerCents,
        currency: job.currency,
        status: 'PAID',
        paypalId: payout.payoutId,
        mode: payout.mode,
        actor: req.actor.email,
      });

      db.addLedger({
        jobId: job.id,
        jobTitle: job.title,
        entryType: 'CREDIT_REFUND',
        event: `Hold Released to Buyer (${s.buyerRefundPct}%)`,
        amountCents: s.refundCents,
        currency: job.currency,
        status: 'REFUNDED',
        paypalId: releaseRefId,
        mode: capture.mode,
        actor: req.actor.email,
      });

      db.appendAudit(job.id, {
        actor: req.actor.email,
        role: req.actor.role,
        action: 'SETTLEMENT_EXECUTED',
        detail: `Captured & Paid $${s.freelancerAmount} (${s.freelancerPct}%) | Released $${s.refundAmount} (${s.buyerRefundPct}%) to Buyer`,
      });

      return {
        status: 200,
        body: {
          job: formatJob(updated),
          capture,
          payout,
          refund: { refundId: releaseRefId, amount: s.refundAmount, status: 'RELEASED_TO_BUYER', mode: capture.mode },
        },
      };
    });
    res.status(out.status).json(out.body);
  } catch (err) {
    next(err);
  }
});

// 11. Simulate 48h Buyer Ghosting SLA Expiry (QA / Demo Endpoint)
router.post('/:id/simulate-sla-expiry', authenticate, (req, res) => {
  const job = db.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found', code: 'JOB_NOT_FOUND' });
  if (job.status !== 'PENDING_APPROVAL') {
    return res.status(409).json({ error: 'Job must be in PENDING_APPROVAL to test 48h SLA escalation', code: 'INVALID_STATE' });
  }
  const expiredTime = new Date(Date.now() - 1000).toISOString();
  const updated = db.updateJob(job.id, {
    deadlineAt: expiredTime,
    demoDeadlineAt: expiredTime,
    status: 'ESCALATED',
    slaEscalated: true,
  });
  db.appendAudit(job.id, {
    actor: 'timelock-sla-monitor',
    role: 'SYSTEM',
    action: 'SLA_48H_EXPIRED_ESCALATED',
    detail: 'Buyer did not respond within 48h after AI verified delivery. Escalated to PayPal Arbitrator to protect freelancer.',
  });
  res.json({ job: formatJob(updated) });
});

// 12. Audit Trail & Cryptographic Tamper-Proof Chain Verification
router.get('/:id/audit', authenticate, (req, res) => {
  const job = db.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found', code: 'JOB_NOT_FOUND' });
  const chainVerification = db.verifyAuditChain(job.auditTrail || []);
  res.json({
    jobId: job.id,
    status: job.status,
    chainIntegrity: chainVerification,
    verification: job.verification,
    clientDecision: job.clientDecision,
    settlement: job.settlement,
    auditTrail: job.auditTrail || [],
  });
});

module.exports = router;
