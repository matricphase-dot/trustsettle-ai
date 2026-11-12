// Tamper-evident SHA-256 cryptographic hash chain for financial & AI audit compliance
const crypto = require('crypto');

function computeEventHash(prevHash, event) {
  const payload = JSON.stringify({
    prevHash: prevHash || 'GENESIS',
    jobId: event.jobId,
    actor: event.actor,
    role: event.role || 'SYSTEM',
    action: event.action,
    detail: event.detail || '',
    at: event.at,
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function createChainedAuditEvent(existingTrail, { jobId, actor, role = 'SYSTEM', action, detail = '', metadata = null }) {
  const prevHash = existingTrail.length > 0 ? existingTrail[existingTrail.length - 1].hash : 'GENESIS';
  const at = new Date().toISOString();
  const baseEvent = {
    seq: existingTrail.length + 1,
    jobId,
    actor,
    role,
    action,
    detail,
    metadata,
    at,
    prevHash,
  };
  const hash = computeEventHash(prevHash, baseEvent);
  return { ...baseEvent, hash };
}

function verifyAuditChain(trail = []) {
  let expectedPrev = 'GENESIS';
  for (let i = 0; i < trail.length; i++) {
    const ev = trail[i];
    if (ev.prevHash !== expectedPrev) {
      return { valid: false, brokenAtSeq: ev.seq || i + 1, reason: 'prevHash mismatch' };
    }
    const recomputed = computeEventHash(ev.prevHash, ev);
    if (recomputed !== ev.hash) {
      return { valid: false, brokenAtSeq: ev.seq || i + 1, reason: 'event hash tampered' };
    }
    expectedPrev = ev.hash;
  }
  return {
    valid: true,
    eventsVerified: trail.length,
    headHash: expectedPrev,
    verifiedAt: new Date().toISOString(),
  };
}

module.exports = { computeEventHash, createChainedAuditEvent, verifyAuditChain };
