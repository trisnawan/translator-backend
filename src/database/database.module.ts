import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';

/**
 * MySQL connection of the application.
 *
 * `synchronize` stays `false` on purpose: the schema is owned by the migrations
 * in `src/database/migrations` (run them with `npm run migration:run`).
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService): TypeOrmModuleOptions => ({
        type: 'mysql',
        host: configService.getOrThrow<string>('database.host'),
        port: configService.getOrThrow<number>('database.port'),
        username: configService.getOrThrow<string>('database.username'),
        password: configService.getOrThrow<string>('database.password'),
        database: configService.getOrThrow<string>('database.database'),
        charset: 'utf8mb4_unicode_ci',
        timezone: 'Z',
        supportBigNumbers: true,
        bigNumberStrings: true,
        autoLoadEntities: true,
        synchronize: configService.getOrThrow<boolean>('database.synchronize'),
        logging: configService.getOrThrow<boolean>('database.logging')
          ? ['query', 'error', 'warn']
          : ['error'],
        extra: {
          connectionLimit: configService.getOrThrow<number>(
            'database.connectionLimit',
          ),
        },
      }),
    }),
  ],
})
export class DatabaseModule {}
