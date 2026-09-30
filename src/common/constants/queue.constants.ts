/**
 * RabbitMQ topology.
 *
 *                         ┌──────────────────────────┐
 *  POST /translate ──────▶│ translator.translate      │──▶ translate worker
 *                         └──────────────────────────┘
 *                         ┌──────────────────────────┐
 *  translate worker ─────▶│ translator.callback       │──▶ callback worker
 *                         └──────────────────────────┘
 *                         ┌──────────────────────────┐
 *  retry (TTL + DLX) ────▶│ translator.*.retry        │──▶ back to the main queue
 *                         └──────────────────────────┘
 */
export const QUEUE_EXCHANGE_TYPE = 'direct';

export const QUEUE_NAMES = {
  TRANSLATE: 'translator.translate',
  TRANSLATE_RETRY: 'translator.translate.retry',
  CALLBACK: 'translator.callback',
  CALLBACK_RETRY: 'translator.callback.retry',
} as const;

export const ROUTING_KEYS = {
  TRANSLATE: 'translate',
  TRANSLATE_RETRY: 'translate.retry',
  CALLBACK: 'callback',
  CALLBACK_RETRY: 'callback.retry',
} as const;

/** RabbitMQ headers used to keep track of the delivery attempts. */
export const MESSAGE_HEADERS = {
  RETRY_COUNT: 'x-retry-count',
  ORIGINAL_QUEUE: 'x-original-queue',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
export type RoutingKey = (typeof ROUTING_KEYS)[keyof typeof ROUTING_KEYS];
