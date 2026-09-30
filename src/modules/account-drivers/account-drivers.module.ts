import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Account } from '../accounts/entities/account.entity';
import { Driver } from '../drivers/entities/driver.entity';
import { AccountDriversController } from './account-drivers.controller';
import { AccountDriversService } from './account-drivers.service';
import { AccountDriver } from './entities/account-driver.entity';

/**
 * Owns the `account_drivers` pivot table.
 *
 * The account and driver repositories are injected directly (instead of
 * importing `AccountsModule` / `DriversModule`) to avoid a circular module
 * dependency, since `DriversModule` needs this module for the client scoped
 * driver list.
 */
@Module({
  imports: [TypeOrmModule.forFeature([AccountDriver, Account, Driver])],
  controllers: [AccountDriversController],
  providers: [AccountDriversService],
  exports: [AccountDriversService],
})
export class AccountDriversModule {}
