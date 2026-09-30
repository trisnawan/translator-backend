import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Stores every timestamp as `datetime(6)` instead of `timestamp(6)`.
 *
 * Why: a `TIMESTAMP` column is converted to/from the **session time zone** of
 * the connection, while the application talks to MySQL in UTC (mysql2
 * `timezone: 'Z'`). MySQL cannot be forced to a UTC session from the driver, so
 * values written by the server itself (`DEFAULT CURRENT_TIMESTAMP`,
 * `ON UPDATE CURRENT_TIMESTAMP`) ended up shifted by the offset between the
 * server session time zone and UTC — e.g. `updated_at` could be hours ahead of
 * `created_at`.
 *
 * `DATETIME` is time zone agnostic: the value sent by the application is stored
 * verbatim, which makes the UTC instant in the database unambiguous for the API,
 * for a DB client and for reporting tools.
 *
 * The existing values keep the meaning they already have in the API responses
 * (the conversion reads them through the same connection settings), except
 * `accounts.updated_at` which was written by the old `ON UPDATE` clause and is
 * therefore normalised to `created_at` first.
 */
export class StoreTimestampsAsUtcDateTime1780280000000 implements MigrationInterface {
  name = 'StoreTimestampsAsUtcDateTime1780280000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Values produced by `ON UPDATE CURRENT_TIMESTAMP(6)` are the only ones that
    // were written with the server session time zone, so they are the only ones
    // that must be corrected before the column type changes.
    await queryRunner.query(
      'UPDATE `accounts` SET `updated_at` = `created_at` WHERE `updated_at` <> `created_at`',
    );

    await queryRunner.query(`
      ALTER TABLE \`accounts\`
        MODIFY \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        MODIFY \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
    `);

    await queryRunner.query(`
      ALTER TABLE \`account_drivers\`
        MODIFY \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
    `);

    await queryRunner.query(`
      ALTER TABLE \`account_keys\`
        MODIFY \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
    `);

    await queryRunner.query(`
      ALTER TABLE \`histories\`
        MODIFY \`requested_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        MODIFY \`translated_at\` datetime(6) NULL DEFAULT NULL,
        MODIFY \`callback_at\` datetime(6) NULL DEFAULT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Best effort revert: MySQL converts the values back using the session time
    // zone, which is exactly the behaviour this migration removes.
    // The `ON UPDATE CURRENT_TIMESTAMP(6)` clause is restored as well.
    await queryRunner.query(`
      ALTER TABLE \`histories\`
        MODIFY \`requested_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        MODIFY \`translated_at\` timestamp(6) NULL DEFAULT NULL,
        MODIFY \`callback_at\` timestamp(6) NULL DEFAULT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE \`account_keys\`
        MODIFY \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
    `);

    await queryRunner.query(`
      ALTER TABLE \`account_drivers\`
        MODIFY \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
    `);

    await queryRunner.query(`
      ALTER TABLE \`accounts\`
        MODIFY \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        MODIFY \`updated_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
    `);
  }
}
