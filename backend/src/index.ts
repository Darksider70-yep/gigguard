import { createApp } from './app';
import { startServer } from './server';

const app = createApp();

if (require.main === module) {
  startServer();
}

export default app;
