import { Module } from '@nestjs/common';
import { AccountKeysModule } from '../account-keys/account-keys.module';
import { DriversModule } from '../drivers/drivers.module';
import { EnginesModule } from '../engines/engines.module';
import { HistoriesModule } from '../histories/histories.module';
import { LanguagesModule } from '../languages/languages.module';
import { RateLimitModule } from '../rate-limit/rate-limit.module';
import { CallbackConsumer } from './callback.consumer';
import { TranslateConsumer } from './translate.consumer';

/**
 * RabbitMQ consumers. Loaded by the API process when `ENABLE_WORKER=true` and
 * by the dedicated worker process (`src/worker.ts`) in production deployments.
 */
@Module({
  imports: [
    LanguagesModule,
    DriversModule,
    AccountKeysModule,
    HistoriesModule,
    EnginesModule,
    RateLimitModule,
  ],
  providers: [TranslateConsumer, CallbackConsumer],
})
export class WorkersModule {}
