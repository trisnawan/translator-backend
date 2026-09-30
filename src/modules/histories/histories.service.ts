import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ROUTING_KEYS } from '../../common/constants/queue.constants';
import { PaginatedResult } from '../../common/dto/paginated-result.dto';
import { AccountRole, CallbackStatus, HistoryStatus } from '../../common/enums';
import { AppException } from '../../common/exceptions/app.exception';
import { AuthenticatedAccount } from '../../common/interfaces/authenticated-account.interface';
import { uuidToBuffer, uuidv7 } from '../../common/utils/uuid.util';
import { QueueService } from '../queue/queue.service';
import { CallbackJobMessage, TranslateJobMessage } from '../queue/queue.types';
import { HistoryCallbackPayload } from './dto/history-callback.dto';
import { HistoryResponse } from './dto/history-response.dto';
import { ListHistoriesQueryDto } from './dto/list-histories-query.dto';
import { History } from './entities/history.entity';

@Injectable()
export class HistoriesService {
  private readonly logger = new Logger(HistoriesService.name);

  constructor(
    @InjectRepository(History)
    private readonly historiesRepository: Repository<History>,
    private readonly queueService: QueueService,
  ) {}

  async paginate(
    query: ListHistoriesQueryDto,
    requester: AuthenticatedAccount,
  ): Promise<PaginatedResult<HistoryResponse>> {
    const builder = this.historiesRepository
      .createQueryBuilder('history')
      .leftJoinAndSelect('history.account', 'account')
      .leftJoinAndSelect('history.driver', 'driver');

    const accountId =
      requester.role === AccountRole.ADMIN ? query.account_id : requester.id;

    if (accountId) {
      builder.andWhere('history.accountId = :accountId', {
        accountId: uuidToBuffer(accountId),
      });
    }

    if (query.status) {
      builder.andWhere('history.status = :status', { status: query.status });
    }

    if (query.callback_status) {
      builder.andWhere('history.callbackStatus = :callbackStatus', {
        callbackStatus: query.callback_status,
      });
    }

    if (query.driver_id) {
      builder.andWhere('history.driverId = :driverId', {
        driverId: query.driver_id,
      });
    }

    if (query.translate_from) {
      builder.andWhere('history.translateFrom = :translateFrom', {
        translateFrom: query.translate_from,
      });
    }

    if (query.translate_to) {
      builder.andWhere('history.translateTo = :translateTo', {
        translateTo: query.translate_to,
      });
    }

    if (query.reference_id) {
      builder.andWhere('history.referenceId = :referenceId', {
        referenceId: query.reference_id,
      });
    }

    if (query.date_from) {
      builder.andWhere('history.requestedAt >= :dateFrom', {
        dateFrom: new Date(query.date_from),
      });
    }

    if (query.date_to) {
      builder.andWhere('history.requestedAt <= :dateTo', {
        dateTo: new Date(query.date_to),
      });
    }

    if (query.search) {
      builder.andWhere(
        '(history.referenceId LIKE :search OR history.referenceContent LIKE :search OR history.translatedContent LIKE :search)',
        {
          search: `%${query.search}%`,
        },
      );
    }

    builder
      .orderBy(
        'history.requestedAt',
        query.order.toUpperCase() as 'ASC' | 'DESC',
      )
      .skip(query.skip)
      .take(query.limit);

    const [items, total] = await builder.getManyAndCount();

    return PaginatedResult.from(
      items.map((item) => this.toResponse(item)),
      total,
      query.page,
      query.limit,
    );
  }

  /** Detail endpoint, scoped for clients. */
  async findDetail(
    id: string,
    requester: AuthenticatedAccount,
  ): Promise<HistoryResponse> {
    const history = await this.findEntity(id);

    if (
      requester.role !== AccountRole.ADMIN &&
      history.accountId !== requester.id
    ) {
      throw AppException.forbidden(
        'You can only access your own translation histories',
      );
    }

    return this.toResponse(await this.loadWithRelations(id));
  }

  /** Unscoped lookup used by the workers and the guards. */
  async findEntity(id: string): Promise<History> {
    const history = await this.historiesRepository.findOne({ where: { id } });

    if (!history) {
      throw AppException.notFound(`History "${id}" was not found`);
    }

    return history;
  }

  async remove(id: string): Promise<void> {
    await this.findEntity(id);
    await this.historiesRepository.delete({ id });
    this.logger.log(`History "${id}" deleted`);
  }

  /**
   * Re-schedules the callback delivery of a job.
   * The worker falls back to the primary key of the account when `key_id` is unknown.
   */
  async resendCallback(
    id: string,
    requester: AuthenticatedAccount,
  ): Promise<HistoryResponse> {
    const history = await this.findEntity(id);

    if (
      requester.role !== AccountRole.ADMIN &&
      history.accountId !== requester.id
    ) {
      throw AppException.forbidden(
        'You can only resend the callback of your own translations',
      );
    }

    await this.historiesRepository.update(
      { id },
      {
        callbackStatus: CallbackStatus.OPEN,
        callbackRetry: 0,
      },
    );

    const message: CallbackJobMessage = {
      historyId: id,
      keyId: null,
      force: true,
      enqueuedAt: new Date().toISOString(),
    };

    await this.queueService.publish(ROUTING_KEYS.CALLBACK, message);
    this.logger.log(`Callback of history "${id}" queued again`);

    return this.toResponse(await this.loadWithRelations(id));
  }

  /** Re-runs the translation of an existing job (admin only). */
  async retranslate(id: string): Promise<HistoryResponse> {
    await this.findEntity(id);

    await this.historiesRepository.update(
      { id },
      {
        status: HistoryStatus.REQUESTED,
        translatedAt: null,
        callbackStatus: CallbackStatus.OPEN,
        callbackRetry: 0,
        callbackAt: null,
      },
    );

    const message: TranslateJobMessage = {
      historyId: id,
      keyId: null,
      force: true,
      enqueuedAt: new Date().toISOString(),
    };

    await this.queueService.publish(ROUTING_KEYS.TRANSLATE, message);
    this.logger.log(`History "${id}" queued again for translation`);

    return this.toResponse(await this.loadWithRelations(id));
  }

  /**
   * Persists a new job as `requested`. Called by `POST /translate` right before
   * the job is published to RabbitMQ.
   */
  async createRequestedJob(input: {
    accountId: string;
    driverId: string;
    translateFrom: string;
    translateTo: string;
    referenceId: string;
    referenceContent: string;
  }): Promise<History> {
    const history: History = {
      id: uuidv7(),
      accountId: input.accountId,
      driverId: input.driverId,
      translateFrom: input.translateFrom,
      translateTo: input.translateTo,
      referenceId: input.referenceId,
      referenceContent: input.referenceContent,
      translatedContent: null,
      status: HistoryStatus.REQUESTED,
      requestedAt: new Date(),
      translatedAt: null,
      callbackStatus: CallbackStatus.OPEN,
      callbackRetry: 0,
      callbackAt: null,
    };

    await this.historiesRepository.insert(history);

    return history;
  }

  async markTranslated(id: string, translatedContent: string): Promise<void> {
    await this.historiesRepository.update(
      { id },
      {
        status: HistoryStatus.TRANSLATED,
        translatedContent,
        translatedAt: new Date(),
      },
    );
  }

  async markFailed(id: string): Promise<void> {
    await this.historiesRepository.update(
      { id },
      {
        status: HistoryStatus.FAILED,
        translatedContent: null,
        translatedAt: new Date(),
      },
    );
  }

  /** A delivery attempt is starting, keep the counter in sync with reality. */
  async registerCallbackAttempt(id: string, attempt: number): Promise<void> {
    await this.historiesRepository.update({ id }, { callbackRetry: attempt });
  }

  async markCallbackDelivered(id: string, attempt: number): Promise<void> {
    await this.historiesRepository.update(
      { id },
      {
        callbackStatus: CallbackStatus.CLOSE,
        callbackRetry: attempt,
        callbackAt: new Date(),
      },
    );
  }

  /** No further attempt will be made (max attempts reached or no callback URL). */
  async closeCallback(id: string, attempt: number): Promise<void> {
    await this.historiesRepository.update(
      { id },
      { callbackStatus: CallbackStatus.CLOSE, callbackRetry: attempt },
    );
  }

  buildCallbackPayload(history: History): HistoryCallbackPayload {
    return {
      status: history.status,
      translate_from: history.translateFrom,
      translate_to: history.translateTo,
      reference_id: history.referenceId,
      translated_content: history.translatedContent,
      translated_at: history.translatedAt
        ? history.translatedAt.toISOString()
        : null,
    };
  }

  private async loadWithRelations(id: string): Promise<History> {
    const history = await this.historiesRepository
      .createQueryBuilder('history')
      .leftJoinAndSelect('history.account', 'account')
      .leftJoinAndSelect('history.driver', 'driver')
      .where('history.id = :id', { id: uuidToBuffer(id) })
      .getOne();

    if (!history) {
      throw AppException.notFound(`History "${id}" was not found`);
    }

    return history;
  }

  toResponse(history: History): HistoryResponse {
    return {
      id: history.id,
      account_id: history.accountId,
      account: history.account
        ? {
            id: history.account.id,
            full_name: history.account.fullName,
            email: history.account.email,
          }
        : null,
      driver_id: history.driverId,
      driver: history.driver
        ? {
            id: history.driver.id,
            name: history.driver.name,
            type: history.driver.type,
            status: history.driver.status,
          }
        : null,
      translate_from: history.translateFrom,
      translate_to: history.translateTo,
      reference_id: history.referenceId,
      reference_content: history.referenceContent,
      translated_content: history.translatedContent,
      status: history.status,
      requested_at: history.requestedAt,
      translated_at: history.translatedAt,
      callback_status: history.callbackStatus,
      callback_retry: history.callbackRetry,
      callback_at: history.callbackAt,
    };
  }
}
