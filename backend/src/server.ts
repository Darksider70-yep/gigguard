import { createApp } from './app';
import { config } from './config';
import { logger } from './lib/logger';

export function startServer() {
  const app = createApp();

  return app.listen(config.PORT, () => {
    logger.info('Server', 'listening', {
      port: config.PORT,
      url: `http://localhost:${config.PORT}`,
    });
  });
}
