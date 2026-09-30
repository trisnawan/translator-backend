import {
  INestApplication,
  INestApplicationContext,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { toBoolean } from './config/environment.helper';

export interface BootstrapOptions {
  /** `true` starts the HTTP server, `false` only boots the Nest context. */
  http: boolean;
}

/**
 * Creates the Nest application and applies the cross cutting concerns:
 * request validation, cookie parsing, CORS, shutdown hooks, ...
 */
export async function createApplication(
  options: BootstrapOptions,
): Promise<INestApplication | INestApplicationContext> {
  const logger = new Logger('Bootstrap');

  if (!options.http) {
    const context = await NestFactory.createApplicationContext(AppModule, {
      bufferLogs: false,
    });
    context.enableShutdownHooks();
    logger.log('Worker context started (no HTTP server)');

    return context;
  }

  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const configService = app.get(ConfigService);
  const origins = configService.getOrThrow<string[]>('app.corsOrigins');

  // Global guards, pipes, interceptors and filters live in `AppModule` so they
  // are also active in tests; the HTTP only concerns stay here.
  app.use(cookieParser());
  app.enableCors({
    // `origin: true` reflects the request origin, required when credentials are
    // sent from the browser (and CORS_ORIGINS contains `*`).
    origin: origins.includes('*') ? true : origins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Accept',
      'Authorization',
      'key_id',
      'key-id',
      'X-Requested-With',
    ],
    maxAge: 3600,
  });
  app.enableShutdownHooks();

  const port = configService.getOrThrow<number>('app.port');
  await app.listen(port, '0.0.0.0');

  logger.log(
    `HTTP server listening on ${configService.getOrThrow<string>('app.url')} (port ${port})`,
  );
  logger.log(
    `Enabled: http=${toBoolean(process.env.ENABLE_HTTP, true)} worker=${toBoolean(process.env.ENABLE_WORKER, true)} broker=${configService.getOrThrow<boolean>('queue.enabled')}`,
  );

  return app;
}
