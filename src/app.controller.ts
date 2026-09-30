import { Controller, Get } from '@nestjs/common';
import { AppService, HealthStatus } from './app.service';
import { Public } from './common/decorators/public.decorator';
import { ResponseMessage } from './common/decorators/response-message.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get()
  @ResponseMessage('Translator API is running')
  getInfo(): Record<string, unknown> {
    return this.appService.getInfo();
  }

  /** Liveness probe, also reports the database and broker state. */
  @Public()
  @Get('health')
  @ResponseMessage('Health check completed')
  getHealth(): Promise<HealthStatus> {
    return this.appService.getHealth();
  }
}
