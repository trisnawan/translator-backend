import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import configuration from '../../config/configuration';
import { validateEnvironment } from '../../config/env.validation';
import { AccountDriver } from '../../modules/account-drivers/entities/account-driver.entity';
import { AccountKey } from '../../modules/account-keys/entities/account-key.entity';
import { Account } from '../../modules/accounts/entities/account.entity';
import { Driver } from '../../modules/drivers/entities/driver.entity';
import { Language } from '../../modules/languages/entities/language.entity';
import { SecurityModule } from '../../modules/security/security.module';
import { DatabaseModule } from '../database.module';
import { SeedService } from './seed.service';

/** Minimal module used by `npm run seed`: database + security helpers only. */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      load: [configuration],
      validate: validateEnvironment,
    }),
    DatabaseModule,
    SecurityModule,
    TypeOrmModule.forFeature([
      Language,
      Driver,
      Account,
      AccountDriver,
      AccountKey,
    ]),
  ],
  providers: [SeedService],
})
export class SeedModule {}
