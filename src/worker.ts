// Dedicated worker entrypoint: boots the Nest context (database, engines,
// RabbitMQ consumers) without starting an HTTP server.
//
// Usage: `ENABLE_HTTP=false node dist/worker.js` or the `worker` service of
// docker-compose. Both consumers also check ENABLE_WORKER.
import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { createApplication } from './bootstrap';

const logger = new Logger('Worker');

async function bootstrap(): Promise<void> {
  if (process.env.ENABLE_WORKER === 'false') {
    logger.warn('ENABLE_WORKER=false, this process has nothing to do');
  }

  const context = await createApplication({ http: false });

  logger.log('Worker started, waiting for messages');
  process.on('SIGTERM', () => void context.close());
  process.on('SIGINT', () => void context.close());
}

process.on('unhandledRejection', (reason) => {
  logger.error(
    `Unhandled promise rejection: ${reason instanceof Error ? reason.message : String(reason)}`,
  );
});

void bootstrap().catch((error: unknown) => {
  logger.error(
    `Worker failed to start: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
