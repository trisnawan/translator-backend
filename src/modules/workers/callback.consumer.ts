import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  QUEUE_NAMES,
  ROUTING_KEYS,
} from '../../common/constants/queue.constants';
import { CallbackStatus, HistoryStatus } from '../../common/enums';
import {
  AccountKeysService,
  ResolvedAccountKey,
} from '../account-keys/account-keys.service';
import { requestJson } from '../engines/http.util';
import { HistoriesService } from '../histories/histories.service';
import { QueueService } from '../queue/queue.service';
import { CallbackJobMessage, QueueMessageContext } from '../queue/queue.types';
import { TokensService } from '../tokens/tokens.service';

/**
 * Consumes `translator.callback` and delivers the result to the `callback_url`
 * of the account key that created the job.
 *
 * Delivery contract (see README):
 * - body: `{ status, translate_from, translate_to, reference_id,
 *   translated_content, translated_at }`
 * - headers: `key_id: <account key id>` and
 *   `Authorization: Bearer <jwt signed with the account key secret>` where the
 *   token payload is `{ account_id, reference_id }`.
 *
 * A failed delivery is re-queued once through `translator.callback.retry`
 * (5 minutes by default). After `CALLBACK_MAX_ATTEMPTS` the job is closed and
 * the admin can replay it with `POST /histories/resend-callback/{id}`.
 */
@Injectable()
export class CallbackConsumer implements OnModuleInit {
  private readonly logger = new Logger(CallbackConsumer.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly queueService: QueueService,
    private readonly historiesService: HistoriesService,
    private readonly accountKeysService: AccountKeysService,
    private readonly tokensService: TokensService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.configService.getOrThrow<boolean>('app.enableWorker')) {
      return;
    }

    await this.queueService.registerConsumer<CallbackJobMessage>({
      queue: QUEUE_NAMES.CALLBACK,
      prefetch: this.configService.getOrThrow<number>('queue.prefetch'),
      handler: (payload, context) => this.handle(payload, context),
    });
  }

  async handle(
    payload: CallbackJobMessage,
    context: QueueMessageContext,
  ): Promise<void> {
    if (!payload?.historyId) {
      this.logger.warn(
        'Received a callback message without historyId, ignoring it',
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

    if (history.status === HistoryStatus.REQUESTED) {
      this.logger.warn(
        `History "${history.id}" is still being translated, the callback will be sent by the translate worker`,
      );

      return;
    }

    if (history.callbackStatus === CallbackStatus.CLOSE && !payload.force) {
      this.logger.log(
        `Callback of history "${history.id}" was already delivered, skipping duplicate message`,
      );

      return;
    }

    const attempt = context.retryCount + 1;
    const target = await this.resolveTarget(payload, history.accountId);

    if (!target || !target.key.callbackUrl) {
      this.logger.warn(
        `History "${history.id}" has no callback URL configured, the client must read the result from /histories`,
      );
      await this.historiesService.closeCallback(history.id, attempt - 1);

      return;
    }

    await this.historiesService.registerCallbackAttempt(history.id, attempt);

    const callbackUrl = target.key.callbackUrl;
    const body = this.historiesService.buildCallbackPayload(history);
    const token = await this.tokensService.signSignatureToken(
      target.secretKey,
      {
        account_id: history.accountId,
        reference_id: history.referenceId,
      },
    );

    try {
      await requestJson<unknown>({
        method: 'POST',
        url: callbackUrl,
        headers: {
          // The client verifies these two headers to trust the payload.
          key_id: target.key.id,
          authorization: `Bearer ${token}`,
        },
        body,
        timeoutMs: this.configService.getOrThrow<number>(
          'queue.callbackTimeoutMs',
        ),
        provider: `Callback ${callbackUrl}`,
      });

      await this.historiesService.markCallbackDelivered(history.id, attempt);
      this.logger.log(
        `Callback of history "${history.id}" delivered to ${callbackUrl} (attempt #${attempt})`,
      );
    } catch (error) {
      const maxAttempts = this.configService.getOrThrow<number>(
        'queue.callbackMaxAttempts',
      );

      this.logger.error(
        `Callback of history "${history.id}" failed (attempt #${attempt}/${maxAttempts}): ${(error as Error).message}`,
      );

      if (attempt < maxAttempts) {
        await this.queueService.publishDelayed(
          QUEUE_NAMES.CALLBACK_RETRY,
          payload,
          context.retryCount,
        );

        return;
      }

      // Attempts exhausted: close the job, the admin can replay it manually.
      await this.historiesService.closeCallback(history.id, attempt);
      this.logger.warn(
        `Callback of history "${history.id}" dropped after ${attempt} attempts`,
      );
    }
  }

  /**
   * Uses the key that created the job when it still exists, otherwise falls back
   * to the oldest key of the account (manual replays do not carry a key id).
   */
  private async resolveTarget(
    payload: CallbackJobMessage,
    accountId: string,
  ): Promise<ResolvedAccountKey | null> {
    if (payload.keyId) {
      const resolved = await this.accountKeysService
        .resolveSecret(payload.keyId)
        .catch(() => null);

      if (resolved) {
        return resolved;
      }

      this.logger.warn(
        `Account key "${payload.keyId}" is not usable anymore, falling back to the primary key of the account`,
      );
    }

    return this.accountKeysService.findPrimaryForAccount(accountId);
  }

  /** Convenience for the queue declaration documentation. */
  static readonly routingKey = ROUTING_KEYS.CALLBACK;
}
