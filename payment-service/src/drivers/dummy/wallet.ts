import { pool } from '../../db';

export async function getBalance(worker_id: string): Promise<number> {
  const { rows } = await pool.query(
    `SELECT balance_paise FROM dummy_wallets WHERE worker_id = $1`,
    [worker_id]
  );
  if (rows.length === 0) return 0;
  return Number(rows[0].balance_paise);
}

export async function creditWallet(worker_id: string, amount_paise: number) {
  await pool.query(
    `INSERT INTO dummy_wallets (worker_id, balance_paise)
     VALUES ($1, $2::bigint)
     ON CONFLICT (worker_id)
     DO UPDATE SET balance_paise = dummy_wallets.balance_paise + EXCLUDED.balance_paise, updated_at = NOW()`,
    [worker_id, amount_paise]
  );
}

export async function debitWallet(worker_id: string, amount_paise: number) {
  // We allow going negative in dummy to avoid complex failures, or ensure it exists
  // Explicitly cast to bigint to resolve "operator is not unique: - unknown" errors
  await pool.query(
    `INSERT INTO dummy_wallets (worker_id, balance_paise)
     VALUES ($1, -($2::bigint))
     ON CONFLICT (worker_id)
     DO UPDATE SET balance_paise = dummy_wallets.balance_paise - EXCLUDED.balance_paise, updated_at = NOW()`,
    [worker_id, amount_paise]
  );
}
