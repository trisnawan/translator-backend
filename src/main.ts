// Loads `.env` before anything else is evaluated so the bootstrap switches
// (ENABLE_HTTP / ENABLE_WORKER) are visible to the AppModule factory below.
import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { createApplication } from './bootstrap';
import { toBoolean } from './config/environment.helper';

const logger = new Logger('Main');

async function bootstrap(): Promise<void> {
  const enableHttp = toBoolean(process.env.ENABLE_HTTP, true);

  if (!enableHttp) {
    logger.warn(
      'ENABLE_HTTP=false, this instance only runs the background workers',
    );

    const context = await createApplication({ http: false });
    logger.log('Workers are running, press Ctrl+C to stop');

    // Keep the process alive: the RabbitMQ consumers are the only activity.
    process.on('SIGTERM', () => void context.close());
    process.on('SIGINT', () => void context.close());

    return;
  }

  await createApplication({ http: true });
}

process.on('unhandledRejection', (reason) => {
  logger.error(
    `Unhandled promise rejection: ${reason instanceof Error ? reason.message : String(reason)}`,
  );
});

void bootstrap().catch((error: unknown) => {
  logger.error(
    `Application failed to start: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
