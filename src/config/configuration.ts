import { toBoolean, toList, toNumber, toString } from './environment.helper';

/**
 * Central application configuration.
 *
 * The configuration is grouped per concern and consumed through `ConfigService`
 * using dot notation, e.g. `configService.get<number>('database.port')`.
 * Nothing inside the application reads `process.env` directly except this file
 * (and the few bootstrap switches that must run before Nest is created).
 */
export interface ApplicationConfiguration {
  app: {
    name: string;
    version: string;
    env: string;
    port: number;
    url: string;
    timezone: string;
    enableHttp: boolean;
    enableWorker: boolean;
    corsOrigins: string[];
    bodyLimit: string;
    isProduction: boolean;
  };
  database: {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
    synchronize: boolean;
    logging: boolean;
    connectionLimit: number;
  };
  security: {
    jwtSecret: string;
    jwtExpiresIn: number;
    jwtCookieName: string;
    signatureTokenTtl: number;
    encryptionKey: string;
    bcryptRounds: number;
  };
  queue: {
    enabled: boolean;
    url: string;
    exchange: string;
    prefetch: number;
    reconnectMs: number;
    translateRetryDelayMs: number;
    translateMaxRetry: number;
    callbackRetryDelayMs: number;
    callbackMaxAttempts: number;
    callbackTimeoutMs: number;
  };
  translation: {
    maxChars: number;
    timeoutMs: number;
    promptExtra: string;
    engines: {
      gemini: {
        baseUrl: string;
        model: string;
        apiVersion: string;
      };
      claude: {
        baseUrl: string;
        model: string;
        version: string;
        maxTokens: number;
      };
      deepseek: {
        baseUrl: string;
        model: string;
      };
      googleTranslate: {
        baseUrl: string;
        format: string;
      };
    };
  };
}

export default (): ApplicationConfiguration => {
  const env = toString(process.env.NODE_ENV, 'development');

  return {
    app: {
      name: toString(process.env.APP_NAME, 'translator-backend'),
      version: toString(process.env.APP_VERSION, '1.0.0'),
      env,
      port: toNumber(process.env.APP_PORT, 3000),
      url: toString(process.env.APP_URL, 'http://localhost:3000'),
      timezone: toString(process.env.APP_TIMEZONE, 'Asia/Jakarta'),
      enableHttp: toBoolean(process.env.ENABLE_HTTP, true),
      enableWorker: toBoolean(process.env.ENABLE_WORKER, true),
      corsOrigins: toList(process.env.CORS_ORIGINS, ['*']),
      bodyLimit: toString(process.env.BODY_LIMIT, '1mb'),
      isProduction: env === 'production',
    },
    database: {
      host: toString(process.env.DB_HOST, 'localhost'),
      port: toNumber(process.env.DB_PORT, 3306),
      username: toString(process.env.DB_USERNAME, 'root'),
      password: process.env.DB_PASSWORD ?? '',
      database: toString(process.env.DB_DATABASE, 'mdi_translator'),
      synchronize: toBoolean(process.env.DB_SYNCHRONIZE, false),
      logging: toBoolean(process.env.DB_LOGGING, false),
      connectionLimit: toNumber(process.env.DB_CONNECTION_LIMIT, 10),
    },
    security: {
      jwtSecret: toString(
        process.env.JWT_SECRET,
        'translator-backend-dev-secret',
      ),
      jwtExpiresIn: toNumber(process.env.JWT_EXPIRES_IN, 86400),
      jwtCookieName: toString(process.env.JWT_COOKIE_NAME, 'access_token'),
      signatureTokenTtl: toNumber(process.env.SIGNATURE_TOKEN_TTL, 300),
      encryptionKey: toString(
        process.env.APP_ENCRYPTION_KEY,
        'translator-backend-dev-encryption-key',
      ),
      bcryptRounds: toNumber(process.env.BCRYPT_ROUNDS, 10),
    },
    queue: {
      enabled: toBoolean(process.env.RABBITMQ_ENABLED, true),
      url: toString(
        process.env.RABBITMQ_URL,
        'amqp://guest:guest@localhost:5672',
      ),
      exchange: toString(process.env.RABBITMQ_EXCHANGE, 'translator'),
      prefetch: toNumber(process.env.RABBITMQ_PREFETCH, 1),
      reconnectMs: toNumber(process.env.RABBITMQ_RECONNECT_MS, 5000),
      translateRetryDelayMs: toNumber(
        process.env.TRANSLATE_RETRY_DELAY_MS,
        60_000,
      ),
      translateMaxRetry: toNumber(process.env.TRANSLATE_MAX_RETRY, 5),
      callbackRetryDelayMs: toNumber(
        process.env.CALLBACK_RETRY_DELAY_MS,
        300_000,
      ),
      callbackMaxAttempts: toNumber(process.env.CALLBACK_MAX_ATTEMPTS, 2),
      callbackTimeoutMs: toNumber(process.env.CALLBACK_TIMEOUT_MS, 15_000),
    },
    translation: {
      maxChars: toNumber(process.env.TRANSLATION_MAX_CHARS, 5000),
      timeoutMs: toNumber(process.env.TRANSLATION_TIMEOUT_MS, 60_000),
      promptExtra: toString(process.env.TRANSLATION_PROMPT_EXTRA, ''),
      engines: {
        gemini: {
          baseUrl: toString(
            process.env.GEMINI_BASE_URL,
            'https://generativelanguage.googleapis.com/v1beta',
          ),
          model: toString(process.env.GEMINI_MODEL, 'gemini-2.5-flash'),
          apiVersion: toString(process.env.GEMINI_API_VERSION, 'v1beta'),
        },
        claude: {
          baseUrl: toString(
            process.env.ANTHROPIC_BASE_URL,
            'https://api.anthropic.com/v1',
          ),
          model: toString(process.env.ANTHROPIC_MODEL, 'claude-sonnet-4-5'),
          version: toString(process.env.ANTHROPIC_VERSION, '2023-06-01'),
          maxTokens: toNumber(process.env.ANTHROPIC_MAX_TOKENS, 8192),
        },
        deepseek: {
          baseUrl: toString(
            process.env.DEEPSEEK_BASE_URL,
            'https://api.deepseek.com/v1',
          ),
          model: toString(process.env.DEEPSEEK_MODEL, 'deepseek-chat'),
        },
        googleTranslate: {
          baseUrl: toString(
            process.env.GOOGLE_TRANSLATE_BASE_URL,
            'https://translation.googleapis.com/language/translate/v2',
          ),
          format: toString(process.env.GOOGLE_TRANSLATE_FORMAT, 'text'),
        },
      },
    },
  };
};
