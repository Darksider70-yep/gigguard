import { pool } from '../../db';

/**
 * Ensures the dummy_wallets table exists.
 * This is a fail-safe in case migrations didn't run.
 */
async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dummy_wallets (
      worker_id     VARCHAR(255) PRIMARY KEY,
      balance_paise BIGINT       NOT NULL DEFAULT 0,
      updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);
}

export async function getBalance(worker_id: string): Promise<number> {
  try {
    const { rows } = await pool.query(
      `SELECT balance_paise FROM dummy_wallets WHERE worker_id = $1`,
      [worker_id]
    );
    if (rows.length === 0) return 0;
    return Number(rows[0].balance_paise);
  } catch (err: any) {
    if (err.message.includes('does not exist')) {
      await ensureTable();
      return 0;
    }
    throw err;
  }
}

export async function creditWallet(worker_id: string, amount_paise: number) {
  try {
    await pool.query(
      `INSERT INTO dummy_wallets (worker_id, balance_paise)
       VALUES ($1, $2::bigint)
       ON CONFLICT (worker_id)
       DO UPDATE SET balance_paise = dummy_wallets.balance_paise + EXCLUDED.balance_paise, updated_at = NOW()`,
      [worker_id, amount_paise]
    );
  } catch (err: any) {
    if (err.message.includes('does not exist')) {
      await ensureTable();
      // Retry once table exists
      await creditWallet(worker_id, amount_paise);
    } else {
      throw err;
    }
  }
}

export async function debitWallet(worker_id: string, amount_paise: number) {
  try {
    await pool.query(
      `INSERT INTO dummy_wallets (worker_id, balance_paise)
       VALUES ($1, -($2::bigint))
       ON CONFLICT (worker_id)
       DO UPDATE SET balance_paise = dummy_wallets.balance_paise - EXCLUDED.balance_paise, updated_at = NOW()`,
      [worker_id, amount_paise]
    );
  } catch (err: any) {
    if (err.message.includes('does not exist')) {
      await ensureTable();
      await debitWallet(worker_id, amount_paise);
    } else {
      throw err;
    }
  }
}
