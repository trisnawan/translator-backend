import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountDriversModule } from '../account-drivers/account-drivers.module';
import { EnginesModule } from '../engines/engines.module';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';
import { Driver } from './entities/driver.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Driver]),
    EnginesModule,
    AccountDriversModule,
  ],
  controllers: [DriversController],
  providers: [DriversService],
  exports: [DriversService],
})
export class DriversModule {}
