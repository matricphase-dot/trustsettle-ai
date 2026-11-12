// Production PayPal Service — Orders v2 + Authorizations v2 + Captures/Refunds v2 + Payouts v1 + Webhooks v1
// Implements exact PayPal escrow lifecycle:
//   1. Create Order (intent: AUTHORIZE) -> buyer approval URL
//   2. Authorize Order -> authorizationId (funds locked on buyer instrument)
//   3. Full Capture OR Final Partial Capture (releases uncaptured hold back to buyer automatically!)
//   4. Void Authorization (full release back to buyer before capture)
//   5. Refund Capture (post-capture partial/full refund)
//   6. Payouts v1 (instant disbursement to freelancer / AI agent PayPal wallet)
//   7. Webhook cryptographic signature verification via PayPal Notifications API

const crypto = require('crypto');
const config = require('../config');
const logger = require('../utils/logger');

const BASE = config.paypal.env === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

let cachedToken = null;
let cachedTokenExp = 0;

function simId(prefix) {
  return `${prefix}-SIM-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
}

async function getAccessToken() {
  if (cachedToken && Date.now() < cachedTokenExp) return cachedToken;
  const basic = Buffer.from(`${config.paypal.clientId}:${config.paypal.clientSecret}`).toString('base64');
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal OAuth2 failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  cachedToken = data.access_token;
  cachedTokenExp = Date.now() + Math.max(60, (data.expires_in || 3600) - 90) * 1000;
  return cachedToken;
}

async function paypalRequest(method, path, body, idempotencyKey) {
  const token = await getAccessToken();
  const reqId = idempotencyKey || `ts-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': reqId,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if ((res.status === 429 || res.status >= 500) && attempt < 2) {
      await new Promise(r => setTimeout(r, 400 * attempt));
      continue;
    }

    if (res.status === 204) return { status: 'VOIDED' };

    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    if (!res.ok) {
      const detail = data?.details?.[0]?.description || data?.message || text.slice(0, 250);
      const err = new Error(`PayPal ${method} ${path} (${res.status}): ${detail}`);
      err.statusCode = 502;
      throw err;
    }
    return data;
  }
}

/**
 * Step 1 & 2: Create Order (intent: AUTHORIZE) and obtain Authorization hold.
 * In live browser checkout, buyer approves via approveUrl, then authorizeOrder() locks the funds.
 */
async function createAuthorizeOrder({ amount, currency = 'USD', jobId, title, idempotencyKey }) {
  const val = Number(amount).toFixed(2);
  if (!config.paypal.isLive) {
    const orderId = simId('ORDER');
    const authorizationId = simId('AUTH');
    return {
      mode: 'demo',
      orderId,
      authorizationId,
      status: 'AUTHORIZED',
      amount: Number(val),
      currency,
      approveUrl: `${config.appUrl}/?approveOrder=${orderId}`,
    };
  }

  const data = await paypalRequest(
    'POST',
    '/v2/checkout/orders',
    {
      intent: 'AUTHORIZE',
      purchase_units: [{
        reference_id: jobId,
        description: `TrustSettle Escrow: ${String(title || '').slice(0, 100)}`,
        amount: { currency_code: currency, value: val },
      }],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: 'TrustSettle AI Escrow',
            user_action: 'PAY_NOW',
            return_url: `${config.appUrl}/api/paypal/return?jobId=${encodeURIComponent(jobId || '')}`,
            cancel_url: `${config.appUrl}/api/paypal/cancel?jobId=${encodeURIComponent(jobId || '')}`,
          },
        },
      },
    },
    idempotencyKey ? `order-${idempotencyKey}` : undefined
  );

  const approveLink = (data.links || []).find(l => l.rel === 'payer-action' || l.rel === 'approve')?.href || null;
  const authObj = data?.purchase_units?.[0]?.payments?.authorizations?.[0];
  return {
    mode: config.paypal.env,
    orderId: data.id,
    authorizationId: authObj?.id || null,
    status: data.status,
    amount: Number(val),
    currency,
    approveUrl: approveLink,
    raw: data,
  };
}

/**
 * Authorize an approved PayPal Order -> produces authorizationId.
 */
async function authorizeApprovedOrder(orderId, idempotencyKey) {
  if (!config.paypal.isLive || String(orderId).includes('SIM') || String(orderId).includes('DEMO')) {
    return { mode: 'demo', orderId, authorizationId: simId('AUTH'), status: 'AUTHORIZED' };
  }
  const data = await paypalRequest('POST', `/v2/checkout/orders/${orderId}/authorize`, {}, idempotencyKey ? `auth-${idempotencyKey}` : undefined);
  const authObj = data?.purchase_units?.[0]?.payments?.authorizations?.[0];
  return {
    mode: config.paypal.env,
    orderId: data.id,
    authorizationId: authObj?.id || data.id,
    status: authObj?.status || data.status,
    raw: data,
  };
}

/**
 * Step 3: Capture Authorization (supports full capture OR partial final_capture for Smart Settlements!).
 * Using /v2/payments/authorizations/{authorization_id}/capture with final_capture=true automatically
 * releases any uncaptured remainder back to the buyer without refund fees!
 */
async function captureAuthorization({ authorizationId, orderId, amount, currency = 'USD', finalCapture = true, idempotencyKey }) {
  const ref = authorizationId || orderId;
  if (!config.paypal.isLive || !ref || String(ref).includes('SIM') || String(ref).includes('DEMO')) {
    return {
      mode: 'demo',
      captureId: simId('CAP'),
      authorizationId: authorizationId || simId('AUTH'),
      orderId,
      status: 'COMPLETED',
      amount: Number(Number(amount).toFixed(2)),
      currency,
      finalCapture,
    };
  }

  // If we have a real authorizationId, capture via Payments v2 Authorizations endpoint
  if (authorizationId) {
    const payload = {
      final_capture: finalCapture,
      note_to_payer: 'TrustSettle AI verified escrow release',
    };
    if (amount !== undefined) {
      payload.amount = { currency_code: currency, value: Number(amount).toFixed(2) };
    }
    const data = await paypalRequest(
      'POST',
      `/v2/payments/authorizations/${authorizationId}/capture`,
      payload,
      idempotencyKey ? `cap-${idempotencyKey}` : undefined
    );
    return {
      mode: config.paypal.env,
      captureId: data.id,
      authorizationId,
      orderId,
      status: data.status,
      amount: Number(amount),
      currency,
      finalCapture,
      raw: data,
    };
  }

  // Fallback if order was created for direct capture
  const data = await paypalRequest('POST', `/v2/checkout/orders/${orderId}/capture`, {}, idempotencyKey ? `cap-${idempotencyKey}` : undefined);
  const capObj = data?.purchase_units?.[0]?.payments?.captures?.[0];
  return {
    mode: config.paypal.env,
    captureId: capObj?.id || data.id,
    orderId,
    status: capObj?.status || data.status,
    amount: Number(amount),
    currency,
    raw: data,
  };
}

/**
 * Step 4: Void Authorization (releases 100% of held funds back to buyer before capture).
 */
async function voidAuthorization(authorizationId, idempotencyKey) {
  if (!config.paypal.isLive || !authorizationId || String(authorizationId).includes('SIM') || String(authorizationId).includes('DEMO')) {
    return { mode: 'demo', voidId: simId('VOID'), authorizationId, status: 'VOIDED' };
  }
  await paypalRequest('POST', `/v2/payments/authorizations/${authorizationId}/void`, undefined, idempotencyKey ? `void-${idempotencyKey}` : undefined);
  return { mode: config.paypal.env, voidId: `VOID-${authorizationId}`, authorizationId, status: 'VOIDED' };
}

/**
 * Step 5: Refund a completed Capture (full or partial).
 */
async function refundCapture({ captureId, amount, currency = 'USD', reason = 'TrustSettle AI settlement refund', idempotencyKey }) {
  if (!config.paypal.isLive || !captureId || String(captureId).includes('SIM') || String(captureId).includes('DEMO')) {
    return {
      mode: 'demo',
      refundId: simId('REF'),
      captureId,
      status: 'COMPLETED',
      amount: Number(Number(amount).toFixed(2)),
      currency,
    };
  }
  const data = await paypalRequest(
    'POST',
    `/v2/payments/captures/${captureId}/refund`,
    {
      amount: { currency_code: currency, value: Number(amount).toFixed(2) },
      note_to_payer: String(reason).slice(0, 250),
    },
    idempotencyKey ? `ref-${idempotencyKey}` : undefined
  );
  return {
    mode: config.paypal.env,
    refundId: data.id,
    captureId,
    status: data.status,
    amount: Number(amount),
    currency,
    raw: data,
  };
}

/**
 * Step 6: Payouts v1 — Instant disbursement to Freelancer or AI Agent wallet.
 */
async function createPayout({ amount, currency = 'USD', receiverEmail, jobId, note = 'TrustSettle AI escrow release', idempotencyKey }) {
  const val = Number(amount).toFixed(2);
  if (!config.paypal.isLive) {
    return {
      mode: 'demo',
      payoutId: simId('PAYOUT'),
      status: 'SUCCESS',
      amount: Number(val),
      currency,
      receiverEmail,
    };
  }
  const batchId = `TS-${jobId || Date.now()}-${crypto.randomBytes(3).toString('hex')}`.slice(0, 48);
  const data = await paypalRequest(
    'POST',
    '/v1/payments/payouts',
    {
      sender_batch_header: {
        sender_batch_id: batchId,
        email_subject: 'TrustSettle AI — Escrow Payment Released',
        email_message: note,
      },
      items: [{
        recipient_type: 'EMAIL',
        amount: { currency_code: currency, value: val },
        receiver: receiverEmail,
        note,
        sender_item_id: `${batchId}-item-1`,
      }],
    },
    idempotencyKey ? `payout-${idempotencyKey}` : undefined
  );
  return {
    mode: config.paypal.env,
    payoutId: data?.batch_header?.payout_batch_id || batchId,
    status: data?.batch_header?.batch_status || 'PENDING',
    amount: Number(val),
    currency,
    receiverEmail,
    raw: data,
  };
}

/**
 * Step 7: Verify PayPal Webhook Cryptographic Signature using official headers.
 */
async function verifyWebhookSignature(headers, body) {
  if (!config.paypal.isLive || !config.paypal.webhookId) {
    return { verified: true, mode: 'demo', note: 'Set PAYPAL_CLIENT_ID, SECRET & PAYPAL_WEBHOOK_ID for cryptographic live verification' };
  }
  try {
    const payload = {
      auth_algo: headers['paypal-auth-algo'] || body.auth_algo,
      cert_url: headers['paypal-cert-url'] || body.cert_url,
      transmission_id: headers['paypal-transmission-id'] || body.transmission_id,
      transmission_sig: headers['paypal-transmission-sig'] || body.transmission_sig,
      transmission_time: headers['paypal-transmission-time'] || body.transmission_time,
      webhook_id: config.paypal.webhookId,
      webhook_event: body,
    };
    if (!payload.transmission_id || !payload.transmission_sig) {
      return { verified: false, mode: config.paypal.env, error: 'Missing PayPal webhook signature headers' };
    }
    const data = await paypalRequest('POST', '/v1/notifications/verify-webhook-signature', payload);
    return { verified: data.verification_status === 'SUCCESS', mode: config.paypal.env };
  } catch (err) {
    logger.warn({ err: err.message }, 'PayPal webhook verification error');
    return { verified: false, mode: config.paypal.env, error: err.message };
  }
}

module.exports = {
  isLive: config.paypal.isLive,
  env: config.paypal.env,
  createAuthorizeOrder,
  authorizeApprovedOrder,
  captureAuthorization,
  voidAuthorization,
  refundCapture,
  createPayout,
  verifyWebhookSignature,
};
