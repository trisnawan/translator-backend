import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { createConnection } from 'mysql2/promise';
import configuration from '../config/configuration';

/**
 * `npm run db:create`
 *
 * Creates the database configured through `.env` when it does not exist yet.
 * Handy on a fresh machine, migrations still have to be run afterwards.
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('CreateDatabase');
  const config = configuration().database;
  const connection = await createConnection({
    host: config.host,
    port: config.port,
    user: config.username,
    password: config.password,
    multipleStatements: false,
  });

  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${config.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    logger.log(
      `Database "${config.database}" is ready on ${config.host}:${config.port}`,
    );
  } finally {
    await connection.end();
  }
}

void bootstrap().catch((error: unknown) => {
  new Logger('CreateDatabase').error(
    `Unable to create the database: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
