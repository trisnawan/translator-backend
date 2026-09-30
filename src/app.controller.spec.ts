import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService, HealthStatus } from './app.service';

describe('AppController', () => {
  let appController: AppController;
  const appService = {
    getInfo: jest.fn(),
    getHealth: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [{ provide: AppService, useValue: appService }],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  it('should be defined', () => {
    expect(appController).toBeDefined();
  });

  it('returns the application information', () => {
    appService.getInfo.mockReturnValue({ name: 'translator-backend' });

    expect(appController.getInfo()).toEqual({ name: 'translator-backend' });
    expect(appService.getInfo).toHaveBeenCalledTimes(1);
  });

  it('returns the health status', async () => {
    const health: HealthStatus = {
      status: 'ok',
      app: 'translator-backend',
      environment: 'test',
      timezone: 'Asia/Jakarta',
      version: '1.0.0',
      uptime: 1,
      timestamp: new Date().toISOString(),
      dependencies: { database: 'up', broker: 'up' },
    };
    appService.getHealth.mockResolvedValue(health);

    await expect(appController.getHealth()).resolves.toEqual(health);
  });
});
