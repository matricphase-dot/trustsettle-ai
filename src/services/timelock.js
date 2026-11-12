// Automated 48h SLA Time-Lock & Anti-Ghosting Worker
// Protects freelancers: if work is verified (PENDING_APPROVAL) and the buyer ghosts past the SLA deadline,
// the job transitions to ESCALATED for Trust & Safety review or pre-agreed SLA release.

const db = require('../db');
const logger = require('../utils/logger');

function sweepExpiredJobs() {
  const now = Date.now();
  const pending = db.listJobs({ status: 'PENDING_APPROVAL' });
  const escalated = [];

  for (const job of pending) {
    if (!job.slaEscalated && job.deadlineAt && new Date(job.deadlineAt).getTime() <= now) {
      const updated = db.updateJob(job.id, {
        status: 'ESCALATED',
        slaEscalated: true,
      });
      db.appendAudit(job.id, {
        actor: 'timelock-worker',
        role: 'SYSTEM',
        action: 'SLA_DEADLINE_EXPIRED',
        detail: '48h buyer review window expired without response. Job escalated to protect freelancer from ghosting.',
      });
      escalated.push(updated);
      logger.info({ jobId: job.id }, 'Job auto-escalated due to 48h SLA expiry');
    }
  }
  return escalated;
}

function startTimelockWorker(intervalMs = 30000) {
  const timer = setInterval(() => {
    try { sweepExpiredJobs(); } catch (e) { logger.warn({ err: e.message }, 'Timelock sweep error'); }
  }, intervalMs);
  timer.unref(); // never block clean process/test shutdown
  return timer;
}

module.exports = { sweepExpiredJobs, startTimelockWorker };
