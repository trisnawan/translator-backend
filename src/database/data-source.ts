import 'dotenv/config';
import { join } from 'path';
import { DataSource } from 'typeorm';
import configuration from '../config/configuration';

const config = configuration();

/**
 * DataSource used by the TypeORM CLI (`npm run migration:*`).
 * The running application builds its own DataSource through
 * `TypeOrmModule.forRootAsync` (see `database.module.ts`).
 */
export default new DataSource({
  type: 'mysql',
  host: config.database.host,
  port: config.database.port,
  username: config.database.username,
  password: config.database.password,
  database: config.database.database,
  charset: 'utf8mb4_unicode_ci',
  timezone: 'Z',
  supportBigNumbers: true,
  bigNumberStrings: true,
  logging: config.database.logging ? ['query', 'error', 'schema'] : ['error'],
  entities: [
    join(__dirname, '..', 'modules', '**', 'entities', '*.entity.{ts,js}'),
  ],
  migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
  migrationsTableName: 'typeorm_migrations',
  synchronize: false,
});
