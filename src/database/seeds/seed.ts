import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SeedModule } from './seed.module';
import { SeedService } from './seed.service';

/** Entrypoint of `npm run seed`. */
async function bootstrap(): Promise<void> {
  const logger = new Logger('Seed');
  const context = await NestFactory.createApplicationContext(SeedModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    await context.get(SeedService).run();
  } catch (error) {
    logger.error(`Seeding failed: ${(error as Error).message}`);
    process.exitCode = 1;
  } finally {
    await context.close();
  }
}

void bootstrap();
