export function renderCheckoutUI(params: {
  order_id:    string;
  amount_paise: number;
  worker_id:   string;
  callback_url: string;
}): string {
  const amountRupees = (params.amount_paise / 100).toFixed(0);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GigGuard Pay — Dummy Mode</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #f3f4f6;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .card {
      background: white;
      border-radius: 16px;
      padding: 32px;
      width: 100%;
      max-width: 400px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.10);
    }
    .badge {
      display: inline-block;
      background: #fef3c7;
      color: #92400e;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      padding: 3px 10px;
      border-radius: 99px;
      margin-bottom: 16px;
    }
    .logo { font-size: 22px; font-weight: 800; color: #1e3a5f; margin-bottom: 4px; }
    .subtitle { color: #6b7280; font-size: 14px; margin-bottom: 24px; }
    .amount-block {
      background: #f0fdf4;
      border: 1.5px solid #bbf7d0;
      border-radius: 12px;
      padding: 20px;
      text-align: center;
      margin-bottom: 24px;
    }
    .amount-label { color: #374151; font-size: 13px; margin-bottom: 4px; }
    .amount-value { color: #166534; font-size: 36px; font-weight: 800; }
    .amount-sub   { color: #6b7280; font-size: 12px; margin-top: 4px; }
    .wallet-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #eff6ff;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 24px;
      font-size: 14px;
    }
    .wallet-label { color: #1e40af; font-weight: 600; }
    .wallet-balance { color: #1e40af; }
    .btn {
      width: 100%;
      padding: 14px;
      border: none;
      border-radius: 10px;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
      margin-bottom: 10px;
      transition: opacity 0.15s;
    }
    .btn:hover { opacity: 0.88; }
    .btn:active { opacity: 0.75; }
    .btn-pay    { background: #16a34a; color: white; }
    .btn-fail   { background: #dc2626; color: white; }
    .btn-abandon { background: #f3f4f6; color: #6b7280; }
    .footer { text-align: center; font-size: 11px; color: #9ca3af; margin-top: 8px; }
    .spinner { display: none; text-align: center; padding: 16px; color: #6b7280; }
    .status-msg { display: none; text-align: center; padding: 12px;
                  border-radius: 8px; margin-bottom: 12px; font-weight: 600; }
    .status-ok  { background: #f0fdf4; color: #166534; }
    .status-err { background: #fef2f2; color: #991b1b; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">⚡ DUMMY MODE — No real money</div>
    <div class="logo">GigGuard</div>
    <div class="subtitle">Policy Payment Simulation</div>

    <div class="amount-block">
      <div class="amount-label">Weekly Premium</div>
      <div class="amount-value">₹\${amountRupees}</div>
      <div class="amount-sub">Order: \${params.order_id.slice(0, 20)}...</div>
    </div>

    <div class="wallet-row" id="walletRow">
      <span class="wallet-label">💰 Dummy Wallet</span>
      <span class="wallet-balance" id="walletBalance">Loading...</span>
    </div>

    <div class="status-msg" id="statusMsg"></div>
    <div class="spinner" id="spinner">Processing...</div>

    <button class="btn btn-pay"    onclick="handlePay()">Pay ₹\${amountRupees}</button>
    <button class="btn btn-fail"   onclick="handleFail()">Simulate Failed Payment</button>
    <button class="btn btn-abandon" onclick="handleAbandon()">Cancel / Abandon</button>

    <div class="footer">Worker: \${params.worker_id} | Dev environment only</div>
  </div>

  <script>
    const ORDER_ID    = '\${params.order_id}';
    const AMOUNT      = \${params.amount_paise};
    const WORKER_ID   = '\${params.worker_id}';
    const CALLBACK    = '\${params.callback_url}';

    // Load wallet balance on mount
    fetch('/wallet/' + WORKER_ID, { headers: { 'X-Service-Key': 'dummy_ui_internal' } })
      .then(r => r.json())
      .then(d => {
        document.getElementById('walletBalance').textContent =
          '₹' + (d.balance_paise / 100).toFixed(0);
      })
      .catch(() => {
        document.getElementById('walletBalance').textContent = 'N/A';
      });

    function showStatus(msg, isError) {
      const el = document.getElementById('statusMsg');
      el.textContent = msg;
      el.className = 'status-msg ' + (isError ? 'status-err' : 'status-ok');
      el.style.display = 'block';
    }

    async function handlePay() {
      document.getElementById('spinner').style.display = 'block';
      const paymentId = 'dummy_pay_' + Math.random().toString(36).slice(2, 14);
      const orderId   = ORDER_ID;
      const sig       = 'dummy_sig_' + Math.random().toString(36).slice(2, 18);

      try {
        const res = await fetch('/orders/' + ORDER_ID + '/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json',
                     'X-Service-Key': 'dummy_ui_internal' },
          body: JSON.stringify({
            driver_payment_id: paymentId,
            driver_order_id:   orderId,
            driver_signature:  sig,
          }),
        });
        const data = await res.json();
        if (data.success) {
          showStatus('✓ Payment successful! Redirecting...', false);
          setTimeout(() => {
            const url = new URL(CALLBACK);
            url.searchParams.set('razorpay_payment_id', paymentId);
            url.searchParams.set('razorpay_order_id',   orderId);
            url.searchParams.set('razorpay_signature',  sig);
            url.searchParams.set('payment_order_id',    ORDER_ID);
            window.location.href = url.toString();
          }, 900);
        } else {
          throw new Error(data.error ?? 'Verification failed');
        }
      } catch (err) {
        document.getElementById('spinner').style.display = 'none';
        showStatus('✗ ' + err.message, true);
      }
    }

    function handleFail() {
      showStatus('✗ Payment declined. Redirecting...', true);
      setTimeout(() => {
        const url = new URL(CALLBACK);
        url.searchParams.set('error', 'payment_failed');
        url.searchParams.set('payment_order_id', ORDER_ID);
        window.location.href = url.toString();
      }, 800);
    }

    function handleAbandon() {
      const url = new URL(CALLBACK);
      url.searchParams.set('error', 'payment_abandoned');
      url.searchParams.set('payment_order_id', ORDER_ID);
      window.location.href = url.toString();
    }
  </script>
</body>
</html>`;
}
