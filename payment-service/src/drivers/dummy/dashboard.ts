/**
 * Admin Dashboard UI for GigGuard Payment Service
 * Real-time monitoring of orders, disbursements, ledger, and wallets.
 */

export function renderDashboardUI(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GigGuard Payment Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-primary: #0a0e1a;
      --bg-card: #111827;
      --bg-elevated: #1a2236;
      --bg-row-hover: #151d30;
      --border: #1e2d4a;
      --text-primary: #f1f5f9;
      --text-secondary: #94a3b8;
      --text-muted: #64748b;
      --accent-amber: #f59e0b;
      --accent-green: #10b981;
      --accent-red: #ef4444;
      --accent-blue: #3b82f6;
      --accent-purple: #8b5cf6;
      --radius: 14px;
      --radius-sm: 10px;
      --shadow-card: 0 4px 20px rgba(0,0,0,0.3);
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, system-ui, sans-serif;
      background: var(--bg-primary);
      background-image: radial-gradient(circle at 20% 10%, rgba(245,158,11,0.03) 0%, transparent 50%),
                         radial-gradient(circle at 80% 90%, rgba(59,130,246,0.02) 0%, transparent 50%);
      color: var(--text-primary);
      min-height: 100vh;
    }

    /* ─── Layout ─── */
    .dashboard-container { max-width: 1200px; margin: 0 auto; padding: 24px 20px; }

    /* ─── Header ─── */
    .dash-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 28px;
      flex-wrap: wrap;
      gap: 12px;
    }
    .dash-title {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .dash-title-icon {
      width: 40px; height: 40px;
      border-radius: 10px;
      background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      box-shadow: 0 4px 12px rgba(245,158,11,0.25);
    }
    .dash-title h1 {
      font-size: 22px;
      font-weight: 800;
      letter-spacing: -0.02em;
    }
    .dash-title .sub { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
    .dash-header-right { display: flex; gap: 10px; align-items: center; }
    .driver-badge {
      background: rgba(16,185,129,0.1);
      border: 1px solid rgba(16,185,129,0.25);
      color: var(--accent-green);
      font-size: 11px;
      font-weight: 700;
      padding: 5px 14px;
      border-radius: 99px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .refresh-btn {
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      color: var(--text-secondary);
      padding: 7px 14px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
      font-family: inherit;
    }
    .refresh-btn:hover { background: var(--bg-card); color: var(--text-primary); }

    /* ─── Stat Cards ─── */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 14px;
      margin-bottom: 24px;
    }
    .stat-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 20px;
      box-shadow: var(--shadow-card);
      position: relative;
      overflow: hidden;
    }
    .stat-card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 2px;
    }
    .stat-card.amber::before  { background: linear-gradient(90deg, #f59e0b, #d97706); }
    .stat-card.green::before  { background: linear-gradient(90deg, #10b981, #059669); }
    .stat-card.blue::before   { background: linear-gradient(90deg, #3b82f6, #2563eb); }
    .stat-card.purple::before { background: linear-gradient(90deg, #8b5cf6, #7c3aed); }
    .stat-icon {
      width: 36px; height: 36px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      margin-bottom: 12px;
    }
    .stat-card.amber  .stat-icon { background: rgba(245,158,11,0.12); }
    .stat-card.green  .stat-icon { background: rgba(16,185,129,0.12); }
    .stat-card.blue   .stat-icon { background: rgba(59,130,246,0.12); }
    .stat-card.purple .stat-icon { background: rgba(139,92,246,0.12); }
    .stat-label { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px; }
    .stat-value { font-size: 28px; font-weight: 800; letter-spacing: -0.02em; }
    .stat-sub { font-size: 11px; color: var(--text-muted); margin-top: 4px; }

    /* ─── Tabs ─── */
    .tabs {
      display: flex;
      gap: 2px;
      background: var(--bg-elevated);
      border-radius: var(--radius-sm);
      padding: 3px;
      margin-bottom: 18px;
      border: 1px solid var(--border);
    }
    .tab {
      flex: 1;
      padding: 10px 16px;
      border: none;
      border-radius: 8px;
      background: transparent;
      color: var(--text-muted);
      font-family: inherit;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .tab.active {
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    }
    .tab:hover:not(.active) { color: var(--text-secondary); }

    /* ─── Table ─── */
    .table-wrapper {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      overflow: hidden;
      box-shadow: var(--shadow-card);
    }
    .table-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid var(--border);
    }
    .table-title { font-size: 14px; font-weight: 700; }
    .table-count {
      font-size: 11px;
      color: var(--text-muted);
      background: var(--bg-elevated);
      padding: 3px 10px;
      border-radius: 99px;
    }
    table { width: 100%; border-collapse: collapse; }
    thead th {
      text-align: left;
      padding: 10px 16px;
      font-size: 10px;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      background: var(--bg-elevated);
      border-bottom: 1px solid var(--border);
    }
    tbody td {
      padding: 12px 16px;
      font-size: 13px;
      color: var(--text-secondary);
      border-bottom: 1px solid rgba(30,45,74,0.4);
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
    }
    tbody tr:hover { background: var(--bg-row-hover); }
    tbody tr:last-child td { border-bottom: none; }
    .td-id { color: var(--accent-blue); }
    .td-amount { color: var(--text-primary); font-weight: 600; }

    /* Status Badges */
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 10px;
      border-radius: 99px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .badge-paid     { background: rgba(16,185,129,0.12); color: #34d399; border: 1px solid rgba(16,185,129,0.25); }
    .badge-created  { background: rgba(245,158,11,0.12); color: #fbbf24; border: 1px solid rgba(245,158,11,0.25); }
    .badge-processing { background: rgba(59,130,246,0.12); color: #60a5fa; border: 1px solid rgba(59,130,246,0.25); }
    .badge-failed   { background: rgba(239,68,68,0.12); color: #f87171; border: 1px solid rgba(239,68,68,0.25); }
    .badge-reversed { background: rgba(139,92,246,0.12); color: #a78bfa; border: 1px solid rgba(139,92,246,0.25); }
    .badge-pending  { background: rgba(100,116,139,0.12); color: #94a3b8; border: 1px solid rgba(100,116,139,0.25); }
    .badge-credit   { background: rgba(16,185,129,0.12); color: #34d399; border: 1px solid rgba(16,185,129,0.25); }
    .badge-debit    { background: rgba(239,68,68,0.12); color: #f87171; border: 1px solid rgba(239,68,68,0.25); }

    .empty-state {
      text-align: center;
      padding: 48px 20px;
      color: var(--text-muted);
      font-size: 14px;
    }
    .empty-state .icon { font-size: 32px; margin-bottom: 8px; }

    /* ─── Tab Panels ─── */
    .tab-panel { display: none; }
    .tab-panel.active { display: block; }

    /* ─── Loading ─── */
    .loading-bar {
      height: 2px;
      background: linear-gradient(90deg, var(--accent-amber), var(--accent-blue), var(--accent-amber));
      background-size: 200%;
      animation: loading 1.2s ease-in-out infinite;
      border-radius: 1px;
      margin-bottom: 12px;
      display: none;
    }
    .loading-bar.active { display: block; }
    @keyframes loading { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

    /* ─── Footer ─── */
    .dash-footer {
      text-align: center;
      padding: 24px 0 8px;
      font-size: 11px;
      color: var(--text-muted);
    }

    @media (max-width: 640px) {
      .stats-grid { grid-template-columns: 1fr 1fr; }
      .tabs { flex-wrap: wrap; }
      table { font-size: 11px; }
      thead th, tbody td { padding: 8px 10px; }
    }
  </style>
</head>
<body>
  <div class="dashboard-container">
    <!-- Header -->
    <div class="dash-header">
      <div class="dash-title">
        <div class="dash-title-icon">🛡</div>
        <div>
          <h1>Payment Dashboard</h1>
          <div class="sub">GigGuard Payment Service · Real-time monitoring</div>
        </div>
      </div>
      <div class="dash-header-right">
        <div class="driver-badge" id="driverBadge">Loading…</div>
        <button class="refresh-btn" onclick="loadAll()">↻ Refresh</button>
      </div>
    </div>

    <div class="loading-bar" id="loadingBar"></div>

    <!-- Stats -->
    <div class="stats-grid">
      <div class="stat-card amber">
        <div class="stat-icon">📦</div>
        <div class="stat-label">Total Orders</div>
        <div class="stat-value" id="statOrders">—</div>
        <div class="stat-sub" id="statOrdersPaid">0 paid</div>
      </div>
      <div class="stat-card green">
        <div class="stat-icon">💸</div>
        <div class="stat-label">Disbursements</div>
        <div class="stat-value" id="statDisb">—</div>
        <div class="stat-sub" id="statDisbPaid">0 paid</div>
      </div>
      <div class="stat-card blue">
        <div class="stat-icon">📊</div>
        <div class="stat-label">Platform Balance</div>
        <div class="stat-value" id="statBalance">—</div>
        <div class="stat-sub">credits − debits</div>
      </div>
      <div class="stat-card purple">
        <div class="stat-icon">🏦</div>
        <div class="stat-label">Platform Wallet</div>
        <div class="stat-value" id="statWallet">—</div>
        <div class="stat-sub">dummy wallet (dev)</div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="tabs">
      <button class="tab active" data-tab="orders" onclick="switchTab('orders')">Orders</button>
      <button class="tab" data-tab="disbursements" onclick="switchTab('disbursements')">Disbursements</button>
      <button class="tab" data-tab="ledger" onclick="switchTab('ledger')">Ledger</button>
    </div>

    <!-- Orders Panel -->
    <div class="tab-panel active" id="panel-orders">
      <div class="table-wrapper">
        <div class="table-header">
          <span class="table-title">Payment Orders</span>
          <span class="table-count" id="orderCount">0</span>
        </div>
        <div id="ordersBody"></div>
      </div>
    </div>

    <!-- Disbursements Panel -->
    <div class="tab-panel" id="panel-disbursements">
      <div class="table-wrapper">
        <div class="table-header">
          <span class="table-title">Disbursements</span>
          <span class="table-count" id="disbCount">0</span>
        </div>
        <div id="disbBody"></div>
      </div>
    </div>

    <!-- Ledger Panel -->
    <div class="tab-panel" id="panel-ledger">
      <div class="table-wrapper">
        <div class="table-header">
          <span class="table-title">Payment Ledger</span>
          <span class="table-count" id="ledgerCount">0</span>
        </div>
        <div id="ledgerBody"></div>
      </div>
    </div>

    <div class="dash-footer">
      GigGuard Payment Service v1.0 · Sandbox Environment
    </div>
  </div>

  <script>
    const SVC_KEY = 'dummy_ui_internal';
    const H = { 'X-Service-Key': SVC_KEY, 'Content-Type': 'application/json' };

    function fmt(paise) {
      return '₹' + (paise / 100).toLocaleString('en-IN');
    }
    function fmtTime(ts) {
      if (!ts) return '—';
      return new Date(ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    }
    function badgeClass(status) {
      const map = { paid:'badge-paid', created:'badge-created', processing:'badge-processing',
                     failed:'badge-failed', reversed:'badge-reversed', pending:'badge-pending',
                     credit:'badge-credit', debit:'badge-debit' };
      return map[status] || 'badge-pending';
    }

    function switchTab(name) {
      document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + name));
    }

    async function loadAll() {
      document.getElementById('loadingBar').classList.add('active');
      try { await Promise.all([loadHealth(), loadOrders(), loadDisbursements(), loadLedger(), loadBalance()]); }
      finally { document.getElementById('loadingBar').classList.remove('active'); }
    }

    async function loadHealth() {
      try {
        const r = await fetch('/health');
        const d = await r.json();
        document.getElementById('driverBadge').textContent = '● ' + d.driver.toUpperCase();
      } catch {}
    }

    async function loadOrders() {
      try {
        const r = await fetch('/orders?limit=50', { headers: H });
        const data = await r.json();
        const rows = Array.isArray(data) ? data : (data.orders || []);
        document.getElementById('statOrders').textContent = rows.length;
        document.getElementById('statOrdersPaid').textContent = rows.filter(o => o.status === 'paid').length + ' paid';
        document.getElementById('orderCount').textContent = rows.length;

        if (!rows.length) {
          document.getElementById('ordersBody').innerHTML = '<div class="empty-state"><div class="icon">📦</div>No orders yet</div>';
          return;
        }
        let html = '<table><thead><tr><th>ID</th><th>Worker</th><th>Amount</th><th>Status</th><th>Created</th></tr></thead><tbody>';
        rows.forEach(o => {
          html += '<tr>'
            + '<td class="td-id">' + (o.id || '').slice(0,16) + '</td>'
            + '<td>' + (o.worker_id || '').slice(0,12) + '</td>'
            + '<td class="td-amount">' + fmt(o.amount_paise) + '</td>'
            + '<td><span class="badge ' + badgeClass(o.status) + '">' + o.status + '</span></td>'
            + '<td>' + fmtTime(o.created_at) + '</td></tr>';
        });
        html += '</tbody></table>';
        document.getElementById('ordersBody').innerHTML = html;
      } catch { document.getElementById('ordersBody').innerHTML = '<div class="empty-state">Failed to load</div>'; }
    }

    async function loadDisbursements() {
      try {
        const r = await fetch('/disbursements?limit=50', { headers: H });
        const data = await r.json();
        const rows = Array.isArray(data) ? data : (data.disbursements || []);
        document.getElementById('statDisb').textContent = rows.length;
        document.getElementById('statDisbPaid').textContent = rows.filter(d => d.status === 'paid').length + ' paid';
        document.getElementById('disbCount').textContent = rows.length;

        if (!rows.length) {
          document.getElementById('disbBody').innerHTML = '<div class="empty-state"><div class="icon">💸</div>No disbursements yet</div>';
          return;
        }
        let html = '<table><thead><tr><th>ID</th><th>Claim</th><th>Worker</th><th>Amount</th><th>Status</th><th>Paid At</th></tr></thead><tbody>';
        rows.forEach(d => {
          html += '<tr>'
            + '<td class="td-id">' + (d.id || '').slice(0,16) + '</td>'
            + '<td>' + (d.claim_id || '').slice(0,12) + '</td>'
            + '<td>' + (d.worker_id || '').slice(0,12) + '</td>'
            + '<td class="td-amount">' + fmt(d.amount_paise) + '</td>'
            + '<td><span class="badge ' + badgeClass(d.status) + '">' + d.status + '</span></td>'
            + '<td>' + fmtTime(d.paid_at) + '</td></tr>';
        });
        html += '</tbody></table>';
        document.getElementById('disbBody').innerHTML = html;
      } catch { document.getElementById('disbBody').innerHTML = '<div class="empty-state">Failed to load</div>'; }
    }

    async function loadLedger() {
      try {
        const r = await fetch('/ledger?limit=50', { headers: H });
        const data = await r.json();
        const rows = Array.isArray(data) ? data : (data.entries || []);
        document.getElementById('ledgerCount').textContent = rows.length;

        if (!rows.length) {
          document.getElementById('ledgerBody').innerHTML = '<div class="empty-state"><div class="icon">📊</div>No ledger entries yet</div>';
          return;
        }
        let html = '<table><thead><tr><th>Type</th><th>Reference</th><th>Worker</th><th>Amount</th><th>Dir</th><th>Time</th></tr></thead><tbody>';
        rows.forEach(e => {
          html += '<tr>'
            + '<td>' + e.entry_type + '</td>'
            + '<td class="td-id">' + (e.reference_id || '').slice(0,14) + '</td>'
            + '<td>' + (e.worker_id || '').slice(0,12) + '</td>'
            + '<td class="td-amount">' + fmt(e.amount_paise) + '</td>'
            + '<td><span class="badge ' + badgeClass(e.direction) + '">' + e.direction + '</span></td>'
            + '<td>' + fmtTime(e.created_at) + '</td></tr>';
        });
        html += '</tbody></table>';
        document.getElementById('ledgerBody').innerHTML = html;
      } catch { document.getElementById('ledgerBody').innerHTML = '<div class="empty-state">Failed to load</div>'; }
    }

    async function loadBalance() {
      try {
        const r = await fetch('/ledger/balance', { headers: H });
        const d = await r.json();
        document.getElementById('statBalance').textContent = fmt(d.platform_balance || 0);
        if (d.dummy_platform_wallet !== undefined) {
          document.getElementById('statWallet').textContent = fmt(d.dummy_platform_wallet);
        } else {
          document.getElementById('statWallet').textContent = 'N/A';
        }
      } catch {}
    }

    // Auto-load on page open
    loadAll();
    // Auto-refresh every 15s
    setInterval(loadAll, 15000);
  </script>
</body>
</html>`;
}
