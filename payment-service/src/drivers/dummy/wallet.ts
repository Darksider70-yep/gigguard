import { pool } from '../../db';

/**
 * Super-logging SQL wrapper
 */
async function query(text: string, params: any[]) {
  console.log(`[wallet-db] Executing: ${text.substring(0, 50)}... | Params: ${JSON.stringify(params)}`);
  try {
    return await pool.query(text, params);
  } catch (err: any) {
    console.error(`[wallet-db] ERROR: ${err.message} | Code: ${err.code} | Pos: ${err.position}`);
    throw err;
  }
}

async function ensureTable() {
  console.log('[wallet-db] Ensuring dummy_wallets table uses BIGINT...');
  await query(`
    CREATE TABLE IF NOT EXISTS dummy_wallets (
      worker_id     VARCHAR(255) PRIMARY KEY,
      balance_paise BIGINT       NOT NULL DEFAULT 0,
      updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `, []);
  
  // Also try to ALTER it in case it's currently an INTEGER
  try {
    await query(`ALTER TABLE dummy_wallets ALTER COLUMN balance_paise TYPE BIGINT`, []);
  } catch {
    // Ignore error if it's already bigint
  }
}

export async function getBalance(worker_id: string): Promise<number> {
  try {
    const { rows } = await query(
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
    // We use a simpler two-step approach if UPSERT fails for some reason
    await query(
      `INSERT INTO dummy_wallets (worker_id, balance_paise)
       VALUES ($1, $2)
       ON CONFLICT (worker_id)
       DO UPDATE SET balance_paise = dummy_wallets.balance_paise + EXCLUDED.balance_paise, updated_at = NOW()`,
      [worker_id, BigInt(amount_paise)]
    );
  } catch (err: any) {
    if (err.message.includes('does not exist')) {
      await ensureTable();
      await creditWallet(worker_id, amount_paise);
    } else {
      throw err;
    }
  }
}

export async function debitWallet(worker_id: string, amount_paise: number) {
  try {
    await query(
      `INSERT INTO dummy_wallets (worker_id, balance_paise)
       VALUES ($1, -($2::bigint))
       ON CONFLICT (worker_id)
       DO UPDATE SET balance_paise = dummy_wallets.balance_paise - EXCLUDED.balance_paise, updated_at = NOW()`,
      [worker_id, BigInt(amount_paise)]
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
