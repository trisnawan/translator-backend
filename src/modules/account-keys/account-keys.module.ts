import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Account } from '../accounts/entities/account.entity';
import { AccountKeysController } from './account-keys.controller';
import { AccountKeysService } from './account-keys.service';
import { AccountKey } from './entities/account-key.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AccountKey, Account])],
  controllers: [AccountKeysController],
  providers: [AccountKeysService],
  exports: [AccountKeysService],
})
export class AccountKeysModule {}
