/**
 * TrustSettle AI — Official Drop-in Merchant Checkout SDK v2.0
 * Allows any marketplace (Upwork, Fiverr, B2B SaaS, PayPal Commerce Platform partners)
 * to embed "Pay with PayPal Escrow (Protected by TrustSettle AI)" in 5 lines of JS.
 */
(function (global) {
  const TrustSettle = {
    version: '2.0.0',
    mount(selector, options = {}) {
      const container = typeof selector === 'string' ? document.querySelector(selector) : selector;
      if (!container) throw new Error('TrustSettle.mount: target container not found');

      const apiKey = options.apiKey || 'ts_test_paypal_hackathon_2026';
      const title = options.title || 'Milestone Escrow Contract';
      const brief = options.brief || 'Deliverables verified against contract rubric before PayPal capture.';
      const budget = Number(options.budget || 250);
      const apiBase = options.apiBase || '';

      container.innerHTML = `
        <div style="background:#0B1224;border:1px solid #1E2D52;border-radius:14px;padding:16px;font-family:system-ui,-apple-system,sans-serif;color:#F8FAFC;max-width:440px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
            <span style="font-size:12px;font-weight:700;color:#38BDF8">🛡️ PayPal Programmable Escrow</span>
            <span style="font-size:11px;background:#0F2942;color:#7DD3FC;padding:3px 8px;border-radius:99px">TrustSettle SDK v2</span>
          </div>
          <div style="font-size:14px;font-weight:700;margin-bottom:4px">${title}</div>
          <div style="font-size:12px;color:#94A3B8;margin-bottom:12px">Funds held via PayPal AUTHORIZE • AI verifies evidence • You approve final release.</div>
          <button id="tsSdkBtn" style="width:100%;padding:11px 16px;border:none;border-radius:10px;background:linear-gradient(90deg,#0070BA,#003087);color:#fff;font-weight:800;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px">
            <span>💳 Hold $${budget.toFixed(2)} USD in PayPal Escrow</span>
          </button>
          <div id="tsSdkOut" style="font-size:11px;color:#10B981;margin-top:8px;font-family:monospace"></div>
        </div>
      `;

      const btn = container.querySelector('#tsSdkBtn');
      const out = container.querySelector('#tsSdkOut');

      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.style.opacity = '0.7';
        out.style.color = '#94A3B8';
        out.textContent = 'Creating escrow & placing PayPal Authorization hold…';
        try {
          const createRes = await fetch(`${apiBase}/api/jobs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
            body: JSON.stringify({ title, brief, budget }),
          });
          const created = await createRes.json();
          if (!createRes.ok) throw new Error(created.error || 'Create failed');

          const fundRes = await fetch(`${apiBase}/api/jobs/${created.job.id}/fund`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': apiKey,
              'Idempotency-Key': `sdk-fund-${created.job.id}`,
            },
          });
          const funded = await fundRes.json();
          if (!fundRes.ok) throw new Error(funded.error || 'Fund failed');

          out.style.color = '#10B981';
          out.textContent = `✓ HELD: ${funded.job.id} • Auth ${funded.paypal.authorizationId}`;
          if (typeof options.onFunded === 'function') options.onFunded(funded);
        } catch (err) {
          out.style.color = '#F87171';
          out.textContent = `✕ ${err.message}`;
        } finally {
          btn.disabled = false;
          btn.style.opacity = '1';
        }
      });
    },
  };

  global.TrustSettle = TrustSettle;
})(typeof window !== 'undefined' ? window : globalThis);
