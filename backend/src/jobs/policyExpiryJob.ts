import cron from 'node-cron';
import { expireOldPolicies } from '../workers/policyExpiry';

export function startPolicyExpiryJob(): void {
  cron.schedule('55 23 * * 0', async () => {
    console.info('[PolicyExpiry] Running policy expiry job');
    try {
      await expireOldPolicies();
    } catch (err) {
      console.error('[PolicyExpiry] Failed:', err);
    }
  });
  console.info('[PolicyExpiry] Scheduled - Sunday 23:55');
}
