import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial schema of the translator backend.
 *
 * Every identifier that conceptually is a UUIDv7 is stored as `binary(16)`
 * which keeps the indexes small while preserving the chronological ordering of
 * UUIDv7 values.
 */
export class InitialSchema1780272000000 implements MigrationInterface {
  name = 'InitialSchema1780272000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`languages\` (
        \`id\` char(2) NOT NULL,
        \`name\` varchar(100) NOT NULL,
        \`status\` enum('active', 'inactive') NOT NULL DEFAULT 'active',
        PRIMARY KEY (\`id\`)
      ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`drivers\` (
        \`id\` varchar(20) NOT NULL,
        \`type\` enum('ai', 'api') NOT NULL,
        \`name\` varchar(100) NOT NULL,
        \`status\` enum('active', 'inactive') NOT NULL DEFAULT 'active',
        \`secret_key\` text NULL,
        \`max_rpm\` int NOT NULL DEFAULT 0,
        \`max_rpd\` int NOT NULL DEFAULT 0,
        PRIMARY KEY (\`id\`)
      ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`accounts\` (
        \`id\` binary(16) NOT NULL,
        \`full_name\` varchar(100) NOT NULL,
        \`email\` varchar(150) NOT NULL,
        \`password\` varchar(255) NOT NULL,
        \`role\` enum('admin', 'client') NOT NULL DEFAULT 'client',
        \`status\` enum('active', 'inactive') NOT NULL DEFAULT 'active',
        \`max_rpm\` int NOT NULL DEFAULT 0,
        \`max_rpd\` int NOT NULL DEFAULT 0,
        \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`uq_accounts_email\` (\`email\`)
      ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`account_drivers\` (
        \`id\` binary(16) NOT NULL,
        \`account_id\` binary(16) NOT NULL,
        \`driver_id\` varchar(20) NOT NULL,
        \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`uq_account_drivers_account_driver\` (\`account_id\`, \`driver_id\`),
        INDEX \`idx_account_drivers_driver_id\` (\`driver_id\`),
        CONSTRAINT \`fk_account_drivers_account\` FOREIGN KEY (\`account_id\`) REFERENCES \`accounts\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`fk_account_drivers_driver\` FOREIGN KEY (\`driver_id\`) REFERENCES \`drivers\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`account_keys\` (
        \`id\` binary(16) NOT NULL,
        \`account_id\` binary(16) NOT NULL,
        \`secret_key\` text NULL,
        \`callback_url\` varchar(500) NULL,
        \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`idx_account_keys_account_id\` (\`account_id\`),
        CONSTRAINT \`fk_account_keys_account\` FOREIGN KEY (\`account_id\`) REFERENCES \`accounts\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`histories\` (
        \`id\` binary(16) NOT NULL,
        \`account_id\` binary(16) NOT NULL,
        \`driver_id\` varchar(20) NOT NULL,
        \`translate_from\` char(2) NOT NULL,
        \`translate_to\` char(2) NOT NULL,
        \`reference_id\` varchar(100) NOT NULL,
        \`reference_content\` text NOT NULL,
        \`translated_content\` text NULL,
        \`status\` enum('requested', 'translated', 'failed') NOT NULL DEFAULT 'requested',
        \`requested_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`translated_at\` timestamp(6) NULL,
        \`callback_status\` enum('open', 'close') NOT NULL DEFAULT 'open',
        \`callback_retry\` int NOT NULL DEFAULT 0,
        \`callback_at\` timestamp(6) NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`idx_histories_account_requested_at\` (\`account_id\`, \`requested_at\`),
        INDEX \`idx_histories_driver_requested_at\` (\`driver_id\`, \`requested_at\`),
        INDEX \`idx_histories_status\` (\`status\`),
        INDEX \`idx_histories_reference_id\` (\`reference_id\`),
        CONSTRAINT \`fk_histories_account\` FOREIGN KEY (\`account_id\`) REFERENCES \`accounts\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`fk_histories_driver\` FOREIGN KEY (\`driver_id\`) REFERENCES \`drivers\` (\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
      ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `histories`');
    await queryRunner.query('DROP TABLE `account_keys`');
    await queryRunner.query('DROP TABLE `account_drivers`');
    await queryRunner.query('DROP TABLE `accounts`');
    await queryRunner.query('DROP TABLE `drivers`');
    await queryRunner.query('DROP TABLE `languages`');
  }
}
