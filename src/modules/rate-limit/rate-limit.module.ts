import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { History } from '../histories/entities/history.entity';
import { RateLimitService } from './rate-limit.service';

/**
 * Account / driver quota enforcement, backed by the `histories` table.
 */
@Module({
  imports: [TypeOrmModule.forFeature([History])],
  providers: [RateLimitService],
  exports: [RateLimitService],
})
export class RateLimitModule {}
