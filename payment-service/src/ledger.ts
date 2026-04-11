import { pool } from './db';

export async function writeLedger(entry: {
  entry_type: string;
  reference_id: string;
  worker_id: string;
  amount_paise: number;
  direction: string;
  driver: string;
  metadata?: any;
}) {
  // Simple check for balance if requested
  await pool.query(
    `INSERT INTO payment_ledger (entry_type, reference_id, worker_id, amount_paise, direction, driver, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      entry.entry_type,
      entry.reference_id,
      entry.worker_id,
      entry.amount_paise,
      entry.direction,
      entry.driver,
      JSON.stringify(entry.metadata || {}),
    ]
  );
}
