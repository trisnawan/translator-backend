import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import configuration from './config/configuration';
import { validateEnvironment } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { AccountDriversModule } from './modules/account-drivers/account-drivers.module';
import { AccountKeysModule } from './modules/account-keys/account-keys.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from './modules/auth/guards/roles.guard';
import { DriversModule } from './modules/drivers/drivers.module';
import { EnginesModule } from './modules/engines/engines.module';
import { HistoriesModule } from './modules/histories/histories.module';
import { LanguagesModule } from './modules/languages/languages.module';
import { QueueModule } from './modules/queue/queue.module';
import { RateLimitModule } from './modules/rate-limit/rate-limit.module';
import { SecurityModule } from './modules/security/security.module';
import { TokensModule } from './modules/tokens/tokens.module';
import { TranslateModule } from './modules/translate/translate.module';
import { WorkersModule } from './modules/workers/workers.module';

/**
 * Root module.
 *
 * The same module is booted by the HTTP API (`src/main.ts`) and by the worker
 * process (`src/worker.ts`); the consumers only start when `ENABLE_WORKER=true`
 * and the HTTP server only listens when `ENABLE_HTTP=true`, so a single
 * deployment unit can run as API-only or worker-only container.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: true,
      envFilePath: ['.env'],
      load: [configuration],
      validate: validateEnvironment,
    }),
    DatabaseModule,
    SecurityModule,
    TokensModule,
    QueueModule,
    AuthModule,
    AccountsModule,
    LanguagesModule,
    DriversModule,
    AccountDriversModule,
    AccountKeysModule,
    HistoriesModule,
    TranslateModule,
    RateLimitModule,
    EnginesModule,
    WorkersModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        // Strip unknown properties and reject them so typos are caught early.
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
        validationError: { target: false, value: false },
      }),
    },
    // Authentication runs first, the role check afterwards.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
