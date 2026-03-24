import { createApp } from './app';
import { config } from './config';
import { startClaimCreationWorker } from './workers/claimCreation';
import { startClaimValidationWorker } from './workers/claimValidation';
import { startPayoutCreationWorker } from './workers/payoutCreation';
import { startTriggerMonitor } from './jobs/triggerMonitor';

export function startServer() {
  const app = createApp();

  startClaimCreationWorker();
  startClaimValidationWorker();
  startPayoutCreationWorker();
  startTriggerMonitor();

  return app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`GigGuard backend listening on http://localhost:${config.port}`);
  });
}
