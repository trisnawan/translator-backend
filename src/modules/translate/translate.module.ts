import { Module } from '@nestjs/common';
import { AccountDriversModule } from '../account-drivers/account-drivers.module';
import { AccountKeysModule } from '../account-keys/account-keys.module';
import { AccountsModule } from '../accounts/accounts.module';
import { DriversModule } from '../drivers/drivers.module';
import { HistoriesModule } from '../histories/histories.module';
import { LanguagesModule } from '../languages/languages.module';
import { RateLimitModule } from '../rate-limit/rate-limit.module';
import { TranslateSignatureGuard } from './guards/translate-signature.guard';
import { TranslateController } from './translate.controller';
import { TranslateService } from './translate.service';

@Module({
  imports: [
    LanguagesModule,
    DriversModule,
    AccountDriversModule,
    AccountKeysModule,
    AccountsModule,
    HistoriesModule,
    RateLimitModule,
  ],
  controllers: [TranslateController],
  providers: [TranslateService, TranslateSignatureGuard],
})
export class TranslateModule {}
