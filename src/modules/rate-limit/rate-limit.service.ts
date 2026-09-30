import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UNLIMITED } from '../../common/constants/app.constants';
import { AppException } from '../../common/exceptions/app.exception';
import { uuidToBuffer } from '../../common/utils/uuid.util';
import { History } from '../histories/entities/history.entity';
import { RateLimitQuota, RateLimitUsage } from './rate-limit.types';

interface UsageRow {
  rpm: string | number | null;
  rpd: string | number | null;
}

/**
 * Quota enforcement for account requests and driver usage.
 *
 * The counters are derived from the `histories` table (the single source of
 * truth for every translation job) instead of an in-memory cache, so the limits
 * also hold when several API/worker instances are running behind a load
 * balancer.
 */
@Injectable()
export class RateLimitService {
  constructor(
    @InjectRepository(History)
    private readonly historiesRepository: Repository<History>,
  ) {}

  private startOfMinuteWindow(now: Date): Date {
    return new Date(now.getTime() - 60_000);
  }

  /** Daily counters reset at 00:00 UTC. */
  private startOfDayWindow(now: Date): Date {
    const start = new Date(now);
    start.setUTCHours(0, 0, 0, 0);

    return start;
  }

  /**
   * Throws a `429` when the account exceeded `max_rpm` or `max_rpd`.
   * An account without quota (`0`) is never limited.
   */
  async assertAccountWithinLimits(account: {
    id: string;
    maxRpm: number;
    maxRpd: number;
  }): Promise<void> {
    const usage = await this.getAccountUsageFor(account);

    if (this.isExceeded(usage)) {
      throw AppException.tooManyRequests(
        `Request quota exceeded: ${usage.usage.rpm}/${usage.limit.rpm} per minute and ${usage.usage.rpd}/${usage.limit.rpd} per day`,
        [
          {
            field: 'max_rpm',
            message: `Requests per minute limit reached (${usage.limit.rpm}), retry after ${usage.rpmResetAt.toISOString()}`,
          },
          {
            field: 'max_rpd',
            message: `Requests per day limit reached (${usage.limit.rpd}), reset at ${usage.rpdResetAt.toISOString()}`,
          },
        ],
      );
    }
  }

  /**
   * Throws a `429` when the driver exceeded `max_rpm` or `max_rpd`.
   * The worker catches this and re-schedules the job instead of failing it.
   */
  async assertDriverWithinLimits(driver: {
    id: string;
    maxRpm: number;
    maxRpd: number;
  }): Promise<void> {
    const usage = await this.getDriverUsageFor(driver);

    if (this.isExceeded(usage)) {
      throw AppException.tooManyRequests(
        `Driver "${driver.id}" quota exceeded: ${usage.usage.rpm}/${usage.limit.rpm} per minute and ${usage.usage.rpd}/${usage.limit.rpd} per day`,
      );
    }
  }

  /** Current counters and limits of an account, exposed for troubleshooting. */
  getAccountUsageFor(account: {
    id: string;
    maxRpm: number;
    maxRpd: number;
  }): Promise<RateLimitUsage> {
    return this.getUsage('account_id', uuidToBuffer(account.id), {
      rpm: account.maxRpm,
      rpd: account.maxRpd,
    });
  }

  /** Current counters and limits of a driver, exposed for troubleshooting. */
  getDriverUsageFor(driver: {
    id: string;
    maxRpm: number;
    maxRpd: number;
  }): Promise<RateLimitUsage> {
    return this.getUsage('driver_id', driver.id, {
      rpm: driver.maxRpm,
      rpd: driver.maxRpd,
    });
  }

  private isExceeded(usage: RateLimitUsage): boolean {
    const rpmExceeded =
      usage.limit.rpm !== UNLIMITED && usage.usage.rpm >= usage.limit.rpm;
    const rpdExceeded =
      usage.limit.rpd !== UNLIMITED && usage.usage.rpd >= usage.limit.rpd;

    return rpmExceeded || rpdExceeded;
  }

  private async getUsage(
    column: 'account_id' | 'driver_id',
    value: string | Buffer,
    limit: RateLimitQuota,
  ): Promise<RateLimitUsage> {
    const now = new Date();
    const minuteStart = this.startOfMinuteWindow(now);
    const dayStart = this.startOfDayWindow(now);

    const row = await this.historiesRepository
      .createQueryBuilder('history')
      .select(
        'SUM(CASE WHEN history.requested_at >= :minuteStart THEN 1 ELSE 0 END)',
        'rpm',
      )
      .addSelect(
        'SUM(CASE WHEN history.requested_at >= :dayStart THEN 1 ELSE 0 END)',
        'rpd',
      )
      .where(`history.${column} = :value`, { value })
      .setParameters({ minuteStart, dayStart })
      .getRawOne<UsageRow>();

    return {
      usage: {
        rpm: Number(row?.rpm ?? 0),
        rpd: Number(row?.rpd ?? 0),
      },
      limit,
      rpmResetAt: new Date(now.getTime() + 60_000),
      rpdResetAt: new Date(dayStart.getTime() + 86_400_000),
    };
  }
}
