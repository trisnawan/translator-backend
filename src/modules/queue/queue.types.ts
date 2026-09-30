/** Message published to `translator.translate` when `POST /translate` is accepted. */
export interface TranslateJobMessage {
  /** `histories.id` of the job to process. */
  historyId: string;
  /** `account_keys.id` used by the caller, required to sign the callback. */
  keyId: string | null;
  /** `true` when the job is re-queued manually through `/histories/retranslate/{id}`. */
  force?: boolean;
  /** ISO timestamp of the first publication, useful when debugging. */
  enqueuedAt?: string;
}

/** Message published to `translator.callback` once a job reached a final state. */
export interface CallbackJobMessage {
  historyId: string;
  keyId: string | null;
  /** `true` when the delivery is requested manually through `/histories/resend-callback/{id}`. */
  force?: boolean;
  enqueuedAt?: string;
}

/** Context handed to a consumer, contains the delivery attempt counter. */
export interface QueueMessageContext {
  queue: string;
  retryCount: number;
  redelivered: boolean;
}

export type QueueMessageHandler<T> = (
  payload: T,
  context: QueueMessageContext,
) => Promise<void>;

/** Definition registered by the worker module to consume a queue. */
export interface QueueConsumerDefinition<T = unknown> {
  queue: string;
  handler: QueueMessageHandler<T>;
  prefetch?: number;
}
