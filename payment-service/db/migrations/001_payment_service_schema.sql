-- ============================================================
-- orders: premium collection orders (worker pays GigGuard)
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_orders (
  id                VARCHAR(255) PRIMARY KEY,
  worker_id         VARCHAR(255)  NOT NULL,
  amount_paise      INTEGER       NOT NULL,
  currency          VARCHAR(3)    NOT NULL DEFAULT 'INR',
  coverage_tier     INTEGER       NOT NULL,
  coverage_amount   INTEGER       NOT NULL,
  status            VARCHAR(30)   NOT NULL DEFAULT 'created',
  driver_order_id   VARCHAR(255),
  driver_payment_id VARCHAR(255),
  driver_signature  VARCHAR(512),
  policy_id         VARCHAR(255),
  idempotency_key   VARCHAR(255)  UNIQUE,
  metadata          JSONB         NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW() + INTERVAL '30 minutes',
  paid_at           TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_worker    ON payment_orders(worker_id);
CREATE INDEX IF NOT EXISTS idx_orders_status    ON payment_orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_driver_id ON payment_orders(driver_order_id);

-- ============================================================
-- disbursements: payouts from GigGuard to workers
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_disbursements (
  id                VARCHAR(255) PRIMARY KEY,
  claim_id          VARCHAR(255) NOT NULL UNIQUE,
  worker_id         VARCHAR(255) NOT NULL,
  amount_paise      INTEGER      NOT NULL,
  upi_address       VARCHAR(255),
  status            VARCHAR(30)  NOT NULL DEFAULT 'pending',
  driver_transfer_id VARCHAR(255),
  idempotency_key   VARCHAR(255) NOT NULL UNIQUE,
  failure_reason    TEXT,
  retry_count       INTEGER      NOT NULL DEFAULT 0,
  next_retry_at     TIMESTAMPTZ,
  metadata          JSONB        NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  paid_at           TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_disb_claim      ON payment_disbursements(claim_id);
CREATE INDEX IF NOT EXISTS idx_disb_worker     ON payment_disbursements(worker_id);
CREATE INDEX IF NOT EXISTS idx_disb_status     ON payment_disbursements(status);
CREATE INDEX IF NOT EXISTS idx_disb_retry      ON payment_disbursements(next_retry_at)
  WHERE status = 'failed' AND retry_count < 3;

-- ============================================================
-- ledger: double-entry record of every financial movement
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_ledger (
  id            BIGSERIAL    PRIMARY KEY,
  entry_type    VARCHAR(30)  NOT NULL,
  reference_id  VARCHAR(255) NOT NULL,
  worker_id     VARCHAR(255) NOT NULL,
  amount_paise  INTEGER      NOT NULL,
  direction     VARCHAR(6)   NOT NULL,
  balance_after INTEGER,
  driver        VARCHAR(20)  NOT NULL,
  metadata      JSONB        NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ledger_ref    ON payment_ledger(reference_id);
CREATE INDEX IF NOT EXISTS idx_ledger_worker ON payment_ledger(worker_id);
CREATE INDEX IF NOT EXISTS idx_ledger_type   ON payment_ledger(entry_type);

-- ============================================================
-- dummy_wallets: virtual balances for development only
-- ============================================================
CREATE TABLE IF NOT EXISTS dummy_wallets (
  worker_id     VARCHAR(255) PRIMARY KEY,
  balance_paise INTEGER      NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

INSERT INTO dummy_wallets (worker_id, balance_paise)
VALUES ('PLATFORM', 1000000)
ON CONFLICT DO NOTHING;

COMMENT ON TABLE dummy_wallets IS
  'Development only. Deleted or ignored in production (PAYMENT_DRIVER=razorpay).
   Each worker starts with a virtual balance. The PLATFORM account receives
   premium payments and makes payout disbursements.';
