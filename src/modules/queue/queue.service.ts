import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { Channel, ChannelModel, ConsumeMessage, Options } from 'amqplib';
import {
  MESSAGE_HEADERS,
  QUEUE_EXCHANGE_TYPE,
  QUEUE_NAMES,
  ROUTING_KEYS,
} from '../../common/constants/queue.constants';
import { AppException } from '../../common/exceptions/app.exception';
import { QueueConsumerDefinition, QueueMessageContext } from './queue.types';

/**
 * Thin wrapper around amqplib.
 *
 * Responsibilities:
 * - keep a single connection/channel pair alive (with automatic reconnection);
 * - declare the exchange, queues and the TTL based retry queues;
 * - expose `publish`/`publishDelayed` for producers and `registerConsumer` for
 *   the workers.
 *
 * The retry queues use a message TTL plus a dead letter exchange, so a retried
 * message reappears in the main queue after the configured delay without any
 * extra plugin (`x-delay` is not required).
 */
@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly consumers: QueueConsumerDefinition<never>[] = [];
  private readonly enabled: boolean;
  private readonly retryDelays: Map<string, number> = new Map();

  private connection?: ChannelModel;
  private channel?: Channel;
  private reconnectTimer?: NodeJS.Timeout;
  private shuttingDown = false;

  constructor(private readonly configService: ConfigService) {
    this.enabled = this.configService.getOrThrow<boolean>('queue.enabled');
    this.retryDelays.set(
      QUEUE_NAMES.TRANSLATE_RETRY,
      this.configService.getOrThrow<number>('queue.translateRetryDelayMs'),
    );
    this.retryDelays.set(
      QUEUE_NAMES.CALLBACK_RETRY,
      this.configService.getOrThrow<number>('queue.callbackRetryDelayMs'),
    );
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  get isConnected(): boolean {
    return Boolean(this.channel);
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      this.logger.warn(
        'RABBITMQ_ENABLED=false, translation jobs will be rejected until the broker is enabled',
      );

      return;
    }

    try {
      await this.connect();
    } catch (error) {
      // Do not prevent the HTTP API from booting, the worker will reconnect.
      this.logger.error(
        `Unable to connect to RabbitMQ: ${this.describeConnectError(error as Error)}`,
      );
      this.scheduleReconnect();
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    try {
      await this.channel?.close();
      await this.connection?.close();
    } catch (error) {
      this.logger.debug(
        `Error while closing the RabbitMQ connection: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Registers a consumer. When the connection is already up the consumer starts
   * immediately, otherwise it is started by the next successful connection.
   */
  async registerConsumer<T>(
    definition: QueueConsumerDefinition<T>,
  ): Promise<void> {
    this.consumers.push(definition);

    if (this.channel) {
      await this.startConsumer(this.channel, definition);
    }
  }

  /** Publishes a message to one of the main queues. */
  // eslint-disable-next-line @typescript-eslint/require-await -- kept async so every publisher has the same contract.
  async publish(routingKey: string, payload: unknown): Promise<void> {
    const channel = this.requireChannel();

    const published = channel.publish(
      this.configService.getOrThrow<string>('queue.exchange'),
      routingKey,
      Buffer.from(JSON.stringify(payload)),
      this.messageOptions(),
    );

    if (!published) {
      throw AppException.serviceUnavailable(
        'Message broker is not accepting messages right now, please try again',
      );
    }
  }

  /**
   * Publishes a message to a retry queue: it is dead-lettered back to its main
   * queue once the configured delay elapsed.
   *
   * The delay is set per message (`expiration`) instead of on the queue
   * (`x-message-ttl`) so the queue arguments never change, which means the
   * application can boot with a different `_RETRY_DELAY_MS` value without
   * having to delete the existing queues first.
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- kept async so every publisher has the same contract.
  async publishDelayed(
    queue: string,
    payload: unknown,
    retryCount: number,
  ): Promise<void> {
    const channel = this.requireChannel();
    const delay = this.retryDelays.get(queue) ?? 60_000;
    const options: Options.Publish = {
      ...this.messageOptions(),
      expiration: String(delay),
      headers: {
        [MESSAGE_HEADERS.RETRY_COUNT]: retryCount + 1,
      },
    };

    const published = channel.sendToQueue(
      queue,
      Buffer.from(JSON.stringify(payload)),
      options,
    );

    if (!published) {
      throw AppException.serviceUnavailable(
        'Message broker is not accepting messages right now, please try again',
      );
    }

    this.logger.log(
      `Message (re)scheduled on ${queue}, next attempt #${retryCount + 1} in ${delay}ms`,
    );
  }

  private async connect(): Promise<void> {
    const url = this.configService.getOrThrow<string>('queue.url');

    this.connection = await amqp.connect(url);
    this.connection.on('error', (error: Error) =>
      this.logger.error(`RabbitMQ connection error: ${error.message}`),
    );
    this.connection.on('close', () => {
      this.channel = undefined;
      this.scheduleReconnect();
    });

    this.channel = await this.connection.createChannel();
    this.channel.on('error', (error: Error) =>
      this.logger.error(`RabbitMQ channel error: ${error.message}`),
    );
    this.channel.on('close', () => {
      this.channel = undefined;
    });

    await this.channel.prefetch(
      this.configService.getOrThrow<number>('queue.prefetch'),
    );
    await this.assertTopology(this.channel);

    for (const consumer of this.consumers) {
      await this.startConsumer(this.channel, consumer);
    }

    this.logger.log(
      `Connected to RabbitMQ (${url.replace(/\/\/.*@/, '//***@')})`,
    );
  }

  /** Declares the exchange, the four queues and their bindings (idempotent). */
  private async assertTopology(channel: Channel): Promise<void> {
    const exchange = this.configService.getOrThrow<string>('queue.exchange');

    await channel.assertExchange(exchange, QUEUE_EXCHANGE_TYPE, {
      durable: true,
    });

    await channel.assertQueue(QUEUE_NAMES.TRANSLATE, { durable: true });
    await channel.bindQueue(
      QUEUE_NAMES.TRANSLATE,
      exchange,
      ROUTING_KEYS.TRANSLATE,
    );

    await channel.assertQueue(QUEUE_NAMES.CALLBACK, { durable: true });
    await channel.bindQueue(
      QUEUE_NAMES.CALLBACK,
      exchange,
      ROUTING_KEYS.CALLBACK,
    );

    await this.assertRetryQueue(
      channel,
      QUEUE_NAMES.TRANSLATE_RETRY,
      ROUTING_KEYS.TRANSLATE_RETRY,
      ROUTING_KEYS.TRANSLATE,
    );
    await this.assertRetryQueue(
      channel,
      QUEUE_NAMES.CALLBACK_RETRY,
      ROUTING_KEYS.CALLBACK_RETRY,
      ROUTING_KEYS.CALLBACK,
    );
  }

  private async assertRetryQueue(
    channel: Channel,
    queue: string,
    routingKey: string,
    targetRoutingKey: string,
  ): Promise<void> {
    const exchange = this.configService.getOrThrow<string>('queue.exchange');

    await channel.assertQueue(queue, {
      durable: true,
      arguments: {
        // The delay itself travels with the message (see publishDelayed).
        'x-dead-letter-exchange': exchange,
        'x-dead-letter-routing-key': targetRoutingKey,
      },
    });
    await channel.bindQueue(queue, exchange, routingKey);
  }

  private async startConsumer(
    channel: Channel,
    definition: QueueConsumerDefinition<never>,
  ): Promise<void> {
    await channel.consume(
      definition.queue,
      (message) => {
        void this.handleMessage(channel, definition, message);
      },
      { noAck: false },
    );

    this.logger.log(`Consumer ready on ${definition.queue}`);
  }

  private async handleMessage(
    channel: Channel,
    definition: QueueConsumerDefinition<never>,
    message: ConsumeMessage | null,
  ): Promise<void> {
    if (!message) {
      return;
    }

    const retryCount = Number(
      message.properties.headers?.[MESSAGE_HEADERS.RETRY_COUNT] ?? 0,
    );
    const context: QueueMessageContext = {
      queue: definition.queue,
      retryCount,
      redelivered: message.fields.redelivered,
    };

    let payload: unknown;

    try {
      payload = JSON.parse(message.content.toString('utf8'));
    } catch (error) {
      this.logger.error(
        `Discarding malformed message on ${definition.queue}: ${(error as Error).message}`,
      );
      channel.nack(message, false, false);

      return;
    }

    try {
      await definition.handler(payload as never, context);
      channel.ack(message);
    } catch (error) {
      this.logger.error(
        `Unhandled error on ${definition.queue}: ${(error as Error).message}`,
        (error as Error).stack,
      );
      // Never requeue blindly: a broken dependency would create a hot loop.
      // Failed jobs are visible through `/histories` and can be replayed manually.
      channel.nack(message, false, false);
    }
  }

  private requireChannel(): Channel {
    if (!this.enabled) {
      throw AppException.serviceUnavailable(
        'Message broker is disabled (RABBITMQ_ENABLED=false)',
      );
    }

    if (!this.channel) {
      this.scheduleReconnect();

      throw AppException.serviceUnavailable(
        'Message broker is unavailable, please try again in a moment',
      );
    }

    return this.channel;
  }

  private messageOptions(): Options.Publish {
    return {
      persistent: true,
      contentType: 'application/json',
      contentEncoding: 'utf-8',
      timestamp: Date.now(),
      headers: {
        [MESSAGE_HEADERS.RETRY_COUNT]: 0,
      },
    };
  }

  private scheduleReconnect(): void {
    if (this.shuttingDown || this.reconnectTimer || !this.enabled) {
      return;
    }

    const delay = this.configService.getOrThrow<number>('queue.reconnectMs');

    this.logger.warn(`Reconnecting to RabbitMQ in ${delay}ms`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connect().catch((error: Error) => {
        this.logger.error(
          `RabbitMQ reconnection failed: ${this.describeConnectError(error)}`,
        );
        this.scheduleReconnect();
      });
    }, delay);
  }

  /**
   * RabbitMQ refuses to declare a queue whose arguments differ from the
   * existing one (406 PRECONDITION_FAILED). Without a hint this error is very
   * confusing to diagnose, so it is spelled out here.
   */
  private describeConnectError(error: Error): string {
    if (error.message.includes('PRECONDITION_FAILED')) {
      return `${error.message} | Hint: a queue with the same name but different arguments already exists on the broker. Delete it from the RabbitMQ management UI (or reset the vhost) and restart.`;
    }

    return error.message;
  }
}
