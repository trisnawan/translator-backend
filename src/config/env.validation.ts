import { Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  IsBooleanString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

/**
 * Minimal environment contract.
 *
 * Only the values that would silently break the application when missing or
 * malformed are validated here: everything else has a safe default inside
 * `configuration.ts`.
 */
class EnvironmentVariables {
  @IsOptional()
  @IsIn(['development', 'production', 'test', 'staging'])
  NODE_ENV?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  APP_PORT?: number;

  @IsOptional()
  @IsBooleanString()
  ENABLE_HTTP?: string;

  @IsOptional()
  @IsBooleanString()
  ENABLE_WORKER?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  RABBITMQ_ENABLED?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  DB_HOST?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  DB_PORT?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  DB_DATABASE?: string;

  @IsOptional()
  @IsString()
  JWT_SECRET?: string;

  @IsOptional()
  @IsString()
  APP_ENCRYPTION_KEY?: string;

  @IsOptional()
  @IsInt()
  @Min(4)
  @Max(15)
  BCRYPT_ROUNDS?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  RABBITMQ_PREFETCH?: number;

  @IsOptional()
  @IsInt()
  @Min(1000)
  CALLBACK_RETRY_DELAY_MS?: number;
}

const INSECURE_DEFAULTS = [
  'change-this-to-a-long-random-string',
  'change-this-to-another-long-random-string',
  'translator-backend-dev-secret',
  'translator-backend-dev-encryption-key',
];

/**
 * Validates `process.env` before the Nest application is created.
 * Throws when the configuration would not be usable at runtime.
 */
export function validateEnvironment(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const logger = new Logger('EnvValidation');
  const config = plainToInstance(EnvironmentVariables, raw, {
    enableImplicitConversion: true,
    excludeExtraneousValues: false,
  });
  const errors = validateSync(config, {
    skipMissingProperties: true,
    whitelist: false,
  });

  if (errors.length > 0) {
    const details = errors
      .map((error) => Object.values(error.constraints ?? {}).join(', '))
      .join('; ');

    throw new Error(`Invalid environment configuration: ${details}`);
  }

  const isProduction = raw.NODE_ENV === 'production';

  if (isProduction) {
    for (const key of ['JWT_SECRET', 'APP_ENCRYPTION_KEY', 'DB_PASSWORD']) {
      const value = raw[key];

      if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(
          `Environment variable ${key} is required when NODE_ENV=production`,
        );
      }

      if (INSECURE_DEFAULTS.includes(value.trim())) {
        throw new Error(
          `Environment variable ${key} is still using the example value, please change it before running in production`,
        );
      }
    }

    if (raw.DB_SYNCHRONIZE === 'true') {
      logger.warn(
        'DB_SYNCHRONIZE is enabled while NODE_ENV=production, migrations should be used instead',
      );
    }
  }

  return raw;
}
