import cron from 'node-cron';
import { expireOldPolicies } from '../workers/policyExpiry';
import { logger } from '../lib/logger';

export function startPolicyExpiryJob(): void {
  cron.schedule('55 23 * * 0', async () => {
    logger.info('PolicyExpiry', 'run_started');
    try {
      await expireOldPolicies();
    } catch (err) {
      logger.error('PolicyExpiry', 'run_failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
  logger.info('PolicyExpiry', 'scheduled', { cron: '55 23 * * 0' });
}
