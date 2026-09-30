import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ROUTING_KEYS } from '../../common/constants/queue.constants';
import { RecordStatus } from '../../common/enums';
import { AppException } from '../../common/exceptions/app.exception';
import {
  AuthenticatedAccount,
  TranslateIdentity,
} from '../../common/interfaces/authenticated-account.interface';
import { AccountDriversService } from '../account-drivers/account-drivers.service';
import { DriversService } from '../drivers/drivers.service';
import { HistoriesService } from '../histories/histories.service';
import { LanguagesService } from '../languages/languages.service';
import { QueueService } from '../queue/queue.service';
import { TranslateJobMessage } from '../queue/queue.types';
import { RateLimitService } from '../rate-limit/rate-limit.service';
import { TranslateAcceptedResponse } from './dto/translate-response.dto';
import { TranslateRequestDto } from './dto/translate-request.dto';

/**
 * Entry point of the translation flow.
 *
 * The HTTP request is only validated and persisted as a `requested` job, the
 * actual translation happens in the worker (see `TranslateConsumer`), so the
 * client gets an immediate `200 OK` and is notified later through its callback.
 */
@Injectable()
export class TranslateService {
  private readonly logger = new Logger(TranslateService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly languagesService: LanguagesService,
    private readonly driversService: DriversService,
    private readonly accountDriversService: AccountDriversService,
    private readonly historiesService: HistoriesService,
    private readonly rateLimitService: RateLimitService,
    private readonly queueService: QueueService,
  ) {}

  async request(
    dto: TranslateRequestDto,
    account: AuthenticatedAccount,
    identity: TranslateIdentity,
  ): Promise<TranslateAcceptedResponse> {
    const maxChars = this.configService.getOrThrow<number>(
      'translation.maxChars',
    );

    if (dto.reference_content.length > maxChars) {
      throw AppException.badRequest(
        `reference_content is ${dto.reference_content.length} characters long, the maximum is ${maxChars}`,
      );
    }

    // 1. Both languages must be registered and active.
    const languages = await this.languagesService.assertUsable([
      dto.translate_from,
      dto.translate_to,
    ]);

    // 2. The driver must be assigned to the account and be ready to use.
    await this.accountDriversService.assertDriverAccess(
      account.id,
      dto.driver_id,
    );

    const driver = await this.driversService.findByIdWithSecret(dto.driver_id);

    if (driver.status !== RecordStatus.ACTIVE) {
      throw AppException.badRequest(`Driver "${dto.driver_id}" is inactive`);
    }

    if (!driver.secretKey || driver.secretKey.trim().length === 0) {
      throw AppException.serviceUnavailable(
        `Driver "${dto.driver_id}" is not configured yet (secret_key is empty)`,
      );
    }

    // 3. The account must stay within its own quota.
    await this.rateLimitService.assertAccountWithinLimits(account);

    // 4. Persist the job, then hand it over to the worker.
    const history = await this.historiesService.createRequestedJob({
      accountId: account.id,
      driverId: driver.id,
      translateFrom:
        languages.get(dto.translate_from)?.id ?? dto.translate_from,
      translateTo: languages.get(dto.translate_to)?.id ?? dto.translate_to,
      referenceId: dto.reference_id,
      referenceContent: dto.reference_content,
    });

    const message: TranslateJobMessage = {
      historyId: history.id,
      keyId: identity.keyId,
      force: false,
      enqueuedAt: new Date().toISOString(),
    };

    try {
      await this.queueService.publish(ROUTING_KEYS.TRANSLATE, message);
    } catch (error) {
      // Never leave an unrunnable job behind: the broker refused the message.
      await this.historiesService.markFailed(history.id);
      this.logger.error(
        `Unable to queue history "${history.id}": ${(error as Error).message}`,
      );

      throw error;
    }

    this.logger.log(
      `History "${history.id}" queued on driver "${driver.id}" (${dto.translate_from} -> ${dto.translate_to})`,
    );

    return {
      history_id: history.id,
      reference_id: history.referenceId,
      driver_id: history.driverId,
      translate_from: history.translateFrom,
      translate_to: history.translateTo,
      status: history.status,
      requested_at: history.requestedAt.toISOString(),
      callback_enabled: Boolean(identity.callbackUrl),
    };
  }
}
