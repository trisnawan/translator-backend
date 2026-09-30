import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { QueueService } from './modules/queue/queue.service';

export interface HealthStatus {
  status: 'ok' | 'degraded';
  app: string;
  environment: string;
  timezone: string;
  version: string;
  uptime: number;
  timestamp: string;
  dependencies: {
    database: 'up' | 'down';
    broker: 'up' | 'down' | 'disabled';
  };
}

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly queueService: QueueService,
  ) {}

  getInfo(): Record<string, unknown> {
    return {
      name: this.configService.getOrThrow<string>('app.name'),
      description: 'Multi language translation REST API',
      environment: this.configService.getOrThrow<string>('app.env'),
      version: this.configService.getOrThrow<string>('app.version'),
      timezone: this.configService.getOrThrow<string>('app.timezone'),
      time: new Date().toISOString(),
      documentation: 'See README.md for the full API reference',
    };
  }

  async getHealth(): Promise<HealthStatus> {
    const database = await this.checkDatabase();
    const brokerEnabled = this.queueService.isEnabled;
    const broker = brokerEnabled
      ? this.queueService.isConnected
        ? 'up'
        : 'down'
      : 'disabled';

    return {
      status: database === 'up' && broker !== 'down' ? 'ok' : 'degraded',
      app: this.configService.getOrThrow<string>('app.name'),
      environment: this.configService.getOrThrow<string>('app.env'),
      timezone: this.configService.getOrThrow<string>('app.timezone'),
      version: this.configService.getOrThrow<string>('app.version'),
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      dependencies: { database, broker },
    };
  }

  private async checkDatabase(): Promise<'up' | 'down'> {
    try {
      await this.dataSource.query('SELECT 1');

      return 'up';
    } catch (error) {
      this.logger.error(
        `Database health check failed: ${(error as Error).message}`,
      );

      return 'down';
    }
  }
}
