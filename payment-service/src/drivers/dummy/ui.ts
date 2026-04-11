/**
 * Premium Dummy Checkout UI for GigGuard Payment Service
 * Dark-themed, mobile-first, UPI-style payment simulation
 */

export function renderCheckoutUI(params: {
  order_id:    string;
  amount_paise: number;
  worker_id:   string;
  callback_url: string;
}): string {
  const amountRupees = (params.amount_paise / 100).toFixed(0);
  const orderId = params.order_id;
  const orderIdShort = params.order_id.slice(0, 16);
  const workerId = params.worker_id;
  const workerIdShort = params.worker_id.slice(0, 16);
  const workerUpi = params.worker_id.slice(0, 12) + '@gigguard';
  const callbackUrl = params.callback_url;
  const amountPaise = params.amount_paise;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GigGuard Pay &mdash; Checkout</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-primary: #0a0e1a;
      --bg-card: #111827;
      --bg-elevated: #1a2236;
      --bg-input: #0d1425;
      --border: #1e2d4a;
      --border-focus: #f59e0b;
      --text-primary: #f1f5f9;
      --text-secondary: #94a3b8;
      --text-muted: #64748b;
      --accent-amber: #f59e0b;
      --accent-amber-glow: rgba(245, 158, 11, 0.2);
      --accent-green: #10b981;
      --accent-green-glow: rgba(16, 185, 129, 0.15);
      --accent-red: #ef4444;
      --accent-red-glow: rgba(239, 68, 68, 0.15);
      --accent-blue: #3b82f6;
      --gradient-amber: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
      --gradient-shimmer: linear-gradient(90deg, transparent, rgba(255,255,255,.04), transparent);
      --radius: 14px;
      --radius-sm: 10px;
      --shadow-card: 0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.03);
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, system-ui, sans-serif;
      background: var(--bg-primary);
      background-image: radial-gradient(circle at 30% 20%, rgba(245,158,11,0.04) 0%, transparent 50%),
                         radial-gradient(circle at 70% 80%, rgba(59,130,246,0.03) 0%, transparent 50%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      color: var(--text-primary);
    }

    .checkout-wrapper { width: 100%; max-width: 420px; }

    .checkout-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow-card);
      overflow: hidden;
      position: relative;
    }
    .checkout-card::before {
      content: '';
      position: absolute;
      top: 0; left: -100%;
      width: 300%; height: 2px;
      background: linear-gradient(90deg, transparent, var(--accent-amber), transparent);
      animation: topGlow 4s ease-in-out infinite;
    }
    @keyframes topGlow {
      0%,100% { transform: translateX(-33%); }
      50% { transform: translateX(0%); }
    }

    /* Header */
    .header {
      padding: 24px 24px 0;
      display: flex; align-items: center; justify-content: space-between;
    }
    .brand { display: flex; align-items: center; gap: 10px; }
    .brand-icon {
      width: 36px; height: 36px; border-radius: 10px;
      background: var(--gradient-amber);
      display: flex; align-items: center; justify-content: center;
      font-size: 18px;
      box-shadow: 0 4px 12px rgba(245,158,11,0.25);
    }
    .brand-name { font-size: 18px; font-weight: 800; letter-spacing: -0.02em; }
    .sandbox-badge {
      display: flex; align-items: center; gap: 5px;
      background: rgba(245,158,11,0.1);
      border: 1px solid rgba(245,158,11,0.25);
      color: var(--accent-amber);
      font-size: 10px; font-weight: 700;
      letter-spacing: 0.06em; text-transform: uppercase;
      padding: 4px 10px; border-radius: 99px;
    }
    .sandbox-badge::before { content: '\\26A1'; font-size: 11px; }

    /* Order Summary */
    .order-section { padding: 20px 24px; }
    .section-label {
      font-size: 11px; font-weight: 600; color: var(--text-muted);
      letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 12px;
    }
    .amount-display {
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 20px; text-align: center;
      position: relative; overflow: hidden;
    }
    .amount-display::after {
      content: '';
      position: absolute; top: 0; left: -100%;
      width: 100%; height: 100%;
      background: var(--gradient-shimmer);
      animation: shimmer 3s ease-in-out infinite;
    }
    @keyframes shimmer { 0% { left: -100%; } 100% { left: 200%; } }
    .amount-currency { font-size: 14px; color: var(--text-secondary); margin-bottom: 2px; }
    .amount-value {
      font-size: 42px; font-weight: 900; letter-spacing: -0.03em;
      background: linear-gradient(135deg, #f1f5f9, #e2e8f0);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .amount-description {
      font-size: 12px; color: var(--text-muted); margin-top: 6px;
      display: flex; align-items: center; justify-content: center; gap: 6px;
    }
    .amount-description .dot {
      width: 3px; height: 3px; background: var(--text-muted); border-radius: 50%;
    }

    /* Details */
    .details-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
      padding: 0 24px 16px;
    }
    .detail-card {
      background: var(--bg-elevated); border: 1px solid var(--border);
      border-radius: var(--radius-sm); padding: 12px;
    }
    .detail-label { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; }
    .detail-value { font-size: 13px; font-weight: 600; color: var(--text-primary); word-break: break-all; }

    /* Wallet */
    .wallet-section {
      margin: 0 24px 16px;
      background: var(--bg-elevated); border: 1px solid var(--border);
      border-radius: var(--radius-sm); padding: 14px 16px;
      display: flex; align-items: center; justify-content: space-between;
    }
    .wallet-left { display: flex; align-items: center; gap: 10px; }
    .wallet-icon {
      width: 32px; height: 32px; border-radius: 8px;
      background: rgba(59,130,246,0.12);
      display: flex; align-items: center; justify-content: center; font-size: 16px;
    }
    .wallet-label { font-size: 12px; color: var(--text-secondary); }
    .wallet-balance { font-size: 15px; font-weight: 700; color: var(--accent-blue); }
    .wallet-topup {
      background: rgba(59,130,246,0.1); border: 1px solid rgba(59,130,246,0.25);
      color: var(--accent-blue); font-size: 11px; font-weight: 600;
      padding: 5px 12px; border-radius: 6px; cursor: pointer; transition: all 0.15s;
    }
    .wallet-topup:hover { background: rgba(59,130,246,0.2); }

    /* UPI */
    .upi-section { padding: 0 24px 20px; }
    .upi-input-group {
      background: var(--bg-input); border: 1.5px solid var(--border);
      border-radius: var(--radius-sm); padding: 12px 14px;
      display: flex; align-items: center; gap: 10px; transition: border-color 0.2s;
    }
    .upi-input-group:focus-within {
      border-color: var(--border-focus); box-shadow: 0 0 0 3px var(--accent-amber-glow);
    }
    .upi-icon { font-size: 20px; }
    .upi-input {
      flex: 1; background: transparent; border: none; color: var(--text-primary);
      font-family: 'Inter', sans-serif; font-size: 14px; font-weight: 500; outline: none;
    }
    .upi-input::placeholder { color: var(--text-muted); }
    .upi-verified {
      font-size: 10px; font-weight: 600; color: var(--accent-green);
      display: flex; align-items: center; gap: 3px;
    }

    /* Security */
    .security-row {
      display: flex; align-items: center; justify-content: center; gap: 6px;
      padding: 0 24px 16px; font-size: 11px; color: var(--text-muted);
    }

    /* Buttons */
    .actions { padding: 0 24px 24px; display: flex; flex-direction: column; gap: 10px; }
    .btn {
      width: 100%; padding: 14px 20px; border: none; border-radius: var(--radius-sm);
      font-family: 'Inter', sans-serif; font-size: 14px; font-weight: 700; cursor: pointer;
      display: flex; align-items: center; justify-content: center; gap: 8px;
      transition: all 0.2s cubic-bezier(.4,0,.2,1); position: relative; overflow: hidden;
    }
    .btn:active { transform: scale(0.98); }
    .btn::after {
      content: ''; position: absolute; inset: 0;
      background: linear-gradient(180deg, rgba(255,255,255,0.08), transparent);
      pointer-events: none;
    }
    .btn-pay {
      background: var(--gradient-amber); color: #000;
      box-shadow: 0 4px 16px rgba(245,158,11,0.3); font-size: 15px;
    }
    .btn-pay:hover { box-shadow: 0 6px 24px rgba(245,158,11,0.4); transform: translateY(-1px); }
    .btn-pay:disabled { opacity: 0.5; cursor: not-allowed; transform: none !important; box-shadow: none !important; }
    .btn-secondary-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .btn-fail {
      background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.25); color: var(--accent-red);
    }
    .btn-fail:hover { background: rgba(239,68,68,0.18); }
    .btn-cancel {
      background: rgba(100,116,139,0.1); border: 1px solid rgba(100,116,139,0.2); color: var(--text-muted);
    }
    .btn-cancel:hover { background: rgba(100,116,139,0.18); }

    /* Overlays */
    .overlay {
      position: absolute; inset: 0;
      background: rgba(10,14,26,0.92); backdrop-filter: blur(8px);
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px;
      z-index: 10; opacity: 0; pointer-events: none; transition: opacity 0.3s;
    }
    .overlay.active { opacity: 1; pointer-events: all; }
    .spinner-ring {
      width: 56px; height: 56px; border: 3px solid var(--border);
      border-top-color: var(--accent-amber); border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .overlay-text { font-size: 15px; font-weight: 600; color: var(--text-primary); }
    .overlay-sub { font-size: 12px; color: var(--text-muted); max-width: 260px; text-align: center; }
    .check-circle {
      width: 64px; height: 64px; border-radius: 50%;
      background: var(--accent-green-glow); border: 2px solid var(--accent-green);
      display: flex; align-items: center; justify-content: center;
      animation: scaleIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }
    .check-circle svg { width: 28px; height: 28px; }
    @keyframes scaleIn { 0% { transform: scale(0); } 100% { transform: scale(1); } }
    .fail-circle {
      width: 64px; height: 64px; border-radius: 50%;
      background: var(--accent-red-glow); border: 2px solid var(--accent-red);
      display: flex; align-items: center; justify-content: center;
      animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both;
    }
    @keyframes shake {
      10%,90% { transform: translateX(-2px); }
      20%,80% { transform: translateX(4px); }
      30%,50%,70% { transform: translateX(-6px); }
      40%,60% { transform: translateX(6px); }
    }
    .fail-circle svg { width: 28px; height: 28px; }

    .footer {
      text-align: center; padding: 16px 0 0; font-size: 11px; color: var(--text-muted);
    }
    .footer a { color: var(--text-secondary); text-decoration: none; }
    .footer a:hover { color: var(--accent-amber); }

    @media (max-width: 480px) {
      body { padding: 8px; }
      .checkout-wrapper { max-width: 100%; }
      .header { padding: 16px 16px 0; }
      .order-section { padding: 16px; }
      .details-grid { padding: 0 16px 12px; }
      .wallet-section { margin: 0 16px 12px; }
      .upi-section { padding: 0 16px 16px; }
      .security-row { padding: 0 16px 12px; }
      .actions { padding: 0 16px 16px; }
      .amount-value { font-size: 34px; }
    }
  </style>
</head>
<body>
  <div class="checkout-wrapper">
    <div class="checkout-card" id="checkoutCard">
      <div class="header">
        <div class="brand">
          <div class="brand-icon">&#x1F6E1;</div>
          <div class="brand-name">GigGuard</div>
        </div>
        <div class="sandbox-badge">Sandbox Mode</div>
      </div>

      <div class="order-section">
        <div class="section-label">Weekly Premium</div>
        <div class="amount-display">
          <div class="amount-currency">Indian Rupees</div>
          <div class="amount-value">&#x20B9;${amountRupees}</div>
          <div class="amount-description">
            <span>Income Protection</span>
            <span class="dot"></span>
            <span>7 Days Coverage</span>
          </div>
        </div>
      </div>

      <div class="details-grid">
        <div class="detail-card">
          <div class="detail-label">Order ID</div>
          <div class="detail-value">${orderIdShort}&#x2026;</div>
        </div>
        <div class="detail-card">
          <div class="detail-label">Worker</div>
          <div class="detail-value">${workerIdShort}&#x2026;</div>
        </div>
      </div>

      <div class="wallet-section">
        <div class="wallet-left">
          <div class="wallet-icon">&#x1F4B3;</div>
          <div>
            <div class="wallet-label">Dummy Wallet</div>
            <div class="wallet-balance" id="walletBal">Loading&#x2026;</div>
          </div>
        </div>
        <button class="wallet-topup" onclick="topupWallet()">+ Top Up</button>
      </div>

      <div class="upi-section">
        <div class="section-label">Payment Method</div>
        <div class="upi-input-group">
          <span class="upi-icon">&#x1F4F1;</span>
          <input type="text" class="upi-input" id="upiInput"
                 placeholder="worker@gigguard"
                 value="${workerUpi}" readonly />
          <span class="upi-verified">&#x2713; Linked</span>
        </div>
      </div>

      <div class="security-row">
        <span>&#x1F512;</span>
        <span>Simulated secure payment &middot; No real money charged</span>
      </div>

      <div class="actions">
        <button class="btn btn-pay" id="btnPay" onclick="handlePay()">
          Pay &#x20B9;${amountRupees}
        </button>
        <div class="btn-secondary-row">
          <button class="btn btn-fail" onclick="handleFail()">Simulate Failure</button>
          <button class="btn btn-cancel" onclick="handleAbandon()">Cancel</button>
        </div>
      </div>

      <div class="overlay" id="processingOverlay">
        <div class="spinner-ring"></div>
        <div class="overlay-text">Processing Payment</div>
        <div class="overlay-sub">Verifying with the dummy payment gateway&#x2026;</div>
      </div>

      <div class="overlay" id="successOverlay">
        <div class="check-circle">
          <svg viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
        <div class="overlay-text" style="color:var(--accent-green)">Payment Successful!</div>
        <div class="overlay-sub">Redirecting to policy confirmation&#x2026;</div>
      </div>

      <div class="overlay" id="failureOverlay">
        <div class="fail-circle">
          <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </div>
        <div class="overlay-text" style="color:var(--accent-red)" id="failText">Payment Failed</div>
        <div class="overlay-sub" id="failSub">Redirecting back&#x2026;</div>
      </div>
    </div>

    <div class="footer">
      GigGuard Payment Service v1.0 &middot; <a href="/ui/dashboard">Dashboard</a>
    </div>
  </div>

  <script>
    var ORDER_ID  = '${orderId}';
    var AMOUNT    = ${amountPaise};
    var WORKER_ID = '${workerId}';
    var CALLBACK  = '${callbackUrl}';

    function loadWallet() {
      fetch('/wallet/' + WORKER_ID, { headers: { 'X-Service-Key': 'dummy_ui_internal' }})
        .then(function(r) { return r.json(); })
        .then(function(d) {
          document.getElementById('walletBal').textContent = String.fromCharCode(0x20B9) + (d.balance_paise / 100).toLocaleString('en-IN');
          var hasBalance = d.balance_paise >= AMOUNT;
          document.getElementById('btnPay').disabled = !hasBalance;
          if (!hasBalance) {
            document.getElementById('walletBal').style.color = 'var(--accent-red)';
          } else {
            document.getElementById('walletBal').style.color = '';
          }
        })
        .catch(function() {
          document.getElementById('walletBal').textContent = String.fromCharCode(0x20B9) + '10,000';
        });
    }
    loadWallet();

    function topupWallet() {
      fetch('/wallet/' + WORKER_ID + '/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Service-Key': 'dummy_ui_internal' },
        body: JSON.stringify({ amount_paise: 50000 })
      }).then(function() { loadWallet(); });
    }

    function handlePay() {
      show('processingOverlay');
      var paymentId = 'dummy_pay_' + Math.random().toString(36).slice(2, 16);
      var sig       = 'dummy_sig_' + Math.random().toString(36).slice(2, 20);

      fetch('/orders/' + ORDER_ID + '/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Service-Key': 'dummy_ui_internal' },
        body: JSON.stringify({
          driver_payment_id: paymentId,
          driver_order_id:   ORDER_ID,
          driver_signature:  sig
        })
      })
      .then(function(res) { return res.json(); })
      .then(function(data) {
        if (data.success) {
          hide('processingOverlay');
          show('successOverlay');
          setTimeout(function() {
            var url = new URL(CALLBACK);
            url.searchParams.set('razorpay_payment_id', paymentId);
            url.searchParams.set('razorpay_order_id',   ORDER_ID);
            url.searchParams.set('razorpay_signature',  sig);
            url.searchParams.set('payment_order_id',    ORDER_ID);
            window.location.href = url.toString();
          }, 1200);
        } else {
          throw new Error(data.error || 'Verification failed');
        }
      })
      .catch(function(err) {
        hide('processingOverlay');
        document.getElementById('failText').textContent = 'Payment Failed';
        document.getElementById('failSub').textContent = err.message;
        show('failureOverlay');
        setTimeout(function() { hide('failureOverlay'); }, 3000);
      });
    }

    function handleFail() {
      show('failureOverlay');
      document.getElementById('failText').textContent = 'Payment Declined';
      document.getElementById('failSub').textContent = 'Simulated failure - redirecting back...';
      setTimeout(function() {
        var url = new URL(CALLBACK);
        url.searchParams.set('error', 'payment_failed');
        url.searchParams.set('payment_order_id', ORDER_ID);
        window.location.href = url.toString();
      }, 1500);
    }

    function handleAbandon() {
      var url = new URL(CALLBACK);
      url.searchParams.set('error', 'payment_abandoned');
      url.searchParams.set('payment_order_id', ORDER_ID);
      window.location.href = url.toString();
    }

    function show(id) { document.getElementById(id).classList.add('active'); }
    function hide(id) { document.getElementById(id).classList.remove('active'); }
  </script>
</body>
</html>`;
}
