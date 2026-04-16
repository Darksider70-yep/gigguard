import { createApp } from './app';
import { startServer } from './server';
import { runMigrations } from './db/migrator';
import { logger } from './lib/logger';

const app = createApp();

if (require.main === module) {
  (async () => {
    try {
      await runMigrations();
      startServer();
    } catch (err: any) {
      logger.error('SYSTEM', 'startup_failed', { 
        message: err.message,
        stack: err.stack,
        code: err.code
      });
      process.exit(1);
    }
  })();
}

export default app;
