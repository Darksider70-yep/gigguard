import { createApp } from './app';
import { config } from './config';

export function startServer() {
  const app = createApp();

  return app.listen(config.PORT, () => {
    console.info(`GigGuard backend listening on http://localhost:${config.PORT}`);
  });
}
