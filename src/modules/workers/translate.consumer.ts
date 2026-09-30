import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpStatus } from '@nestjs/common';
import {
  QUEUE_NAMES,
  ROUTING_KEYS,
} from '../../common/constants/queue.constants';
import { HistoryStatus } from '../../common/enums';
import { AppException } from '../../common/exceptions/app.exception';
import { DriversService } from '../drivers/drivers.service';
import { EngineRegistry } from '../engines/engine.registry';
import { HistoriesService } from '../histories/histories.service';
import { LanguagesService } from '../languages/languages.service';
import { QueueService } from '../queue/queue.service';
import { QueueMessageContext, TranslateJobMessage } from '../queue/queue.types';
import { RateLimitService } from '../rate-limit/rate-limit.service';

/**
 * Consumes `translator.translate` one message at a time (prefetch = 1).
 *
 * Flow: load the job → check driver readiness and quota → translate → persist
 * the result → queue the callback. Transient problems (driver quota reached,
 * provider unavailable) are re-scheduled through `translator.translate.retry`;
 * permanent problems (inactive driver, missing credential, provider rejected the
 * request) mark the job as `failed` so the client is notified right away.
 */
@Injectable()
export class TranslateConsumer implements OnModuleInit {
  private readonly logger = new Logger(TranslateConsumer.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly queueService: QueueService,
    private readonly historiesService: HistoriesService,
    private readonly driversService: DriversService,
    private readonly languagesService: LanguagesService,
    private readonly engineRegistry: EngineRegistry,
    private readonly rateLimitService: RateLimitService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.configService.getOrThrow<boolean>('app.enableWorker')) {
      this.logger.warn(
        'ENABLE_WORKER=false, this instance will not consume translation jobs',
      );

      return;
    }

    await this.queueService.registerConsumer<TranslateJobMessage>({
      queue: QUEUE_NAMES.TRANSLATE,
      prefetch: this.configService.getOrThrow<number>('queue.prefetch'),
      handler: (payload, context) => this.handle(payload, context),
    });
  }

  async handle(
    payload: TranslateJobMessage,
    context: QueueMessageContext,
  ): Promise<void> {
    if (!payload?.historyId) {
      this.logger.warn(
        'Received a translate message without historyId, ignoring it',
      );

      return;
    }

    const history = await this.historiesService
      .findEntity(payload.historyId)
      .catch(() => null);

    if (!history) {
      this.logger.warn(
        `History "${payload.historyId}" does not exist anymore, ignoring the message`,
      );

      return;
    }

    if (history.status !== HistoryStatus.REQUESTED && !payload.force) {
      this.logger.log(
        `History "${history.id}" is already ${history.status}, skipping duplicate message`,
      );

      return;
    }

    const maxRetry = this.configService.getOrThrow<number>(
      'queue.translateMaxRetry',
    );

    // 1. The driver has to be usable: active and with a credential.
    let driver: Awaited<ReturnType<DriversService['findRunnable']>>;

    try {
      driver = await this.driversService.findRunnable(history.driverId);
    } catch (error) {
      await this.failJob(history.id, payload, (error as Error).message);

      return;
    }

    // 2. Driver quota (max_rpm / max_rpd).
    try {
      await this.rateLimitService.assertDriverWithinLimits(driver.driver);
    } catch (error) {
      if (this.isQuotaExceeded(error) && context.retryCount < maxRetry) {
        await this.reschedule(payload, context, (error as Error).message);

        return;
      }

      await this.failJob(history.id, payload, (error as Error).message);

      return;
    }

    // 3. Translation.
    try {
      const languages = await this.languagesService.assertUsable([
        history.translateFrom,
        history.translateTo,
      ]);
      const translatedContent =
        history.translateFrom === history.translateTo
          ? history.referenceContent
          : (
              await this.engineRegistry.resolve(history.driverId).translate({
                text: history.referenceContent,
                from: history.translateFrom,
                fromName:
                  languages.get(history.translateFrom)?.name ??
                  history.translateFrom,
                to: history.translateTo,
                toName:
                  languages.get(history.translateTo)?.name ??
                  history.translateTo,
                secretKey: driver.secretKey,
                driverId: driver.driver.id,
                driverName: driver.driver.name,
              })
            ).text;

      await this.historiesService.markTranslated(history.id, translatedContent);
      this.logger.log(
        `History "${history.id}" translated with driver "${history.driverId}"`,
      );

      await this.queueCallback(history.id, payload.keyId);
    } catch (error) {
      const retryable =
        error instanceof AppException &&
        error.hasStatus(HttpStatus.SERVICE_UNAVAILABLE);

      if (retryable && context.retryCount < maxRetry) {
        await this.reschedule(payload, context, (error as Error).message);

        return;
      }

      await this.failJob(history.id, payload, (error as Error).message);
    }
  }

  private async reschedule(
    payload: TranslateJobMessage,
    context: QueueMessageContext,
    reason: string,
  ): Promise<void> {
    this.logger.warn(
      `History "${payload.historyId}" rescheduled (attempt #${context.retryCount + 1}): ${reason}`,
    );

    try {
      await this.queueService.publishDelayed(
        QUEUE_NAMES.TRANSLATE_RETRY,
        payload,
        context.retryCount,
      );
    } catch (error) {
      this.logger.error(
        `Unable to reschedule history "${payload.historyId}": ${(error as Error).message}`,
      );
      await this.historiesService.markFailed(payload.historyId);
    }
  }

  private async failJob(
    historyId: string,
    payload: TranslateJobMessage,
    reason: string,
  ): Promise<void> {
    this.logger.error(`History "${historyId}" failed: ${reason}`);

    await this.historiesService.markFailed(historyId);
    // The client is informed about the failure through the same callback contract.
    await this.queueCallback(historyId, payload.keyId).catch((error: Error) =>
      this.logger.error(
        `Unable to queue the failure callback: ${error.message}`,
      ),
    );
  }

  private async queueCallback(
    historyId: string,
    keyId: string | null,
  ): Promise<void> {
    await this.queueService.publish(ROUTING_KEYS.CALLBACK, {
      historyId,
      keyId,
      force: false,
      enqueuedAt: new Date().toISOString(),
    });
  }

  private isQuotaExceeded(error: unknown): boolean {
    return (
      error instanceof AppException &&
      error.hasStatus(HttpStatus.TOO_MANY_REQUESTS)
    );
  }
}
