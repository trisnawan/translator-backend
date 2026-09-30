import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { signHs256Token } from '../common/utils/jwt.util';
import configuration from '../config/configuration';

/**
 * `npm run token:sign -- <key_id> <account_id> <reference_id> [secret_key]`
 *
 * Generates the `Authorization: Bearer` token required by `POST /translate`.
 *
 * The token is a plain HS256 JWT signed with `account_keys.secret_key` and the
 * payload `{ account_id, reference_id }` — the exact same token your client
 * application has to build. This script only exists to make manual testing easy.
 *
 * Pass the secret as the fourth argument or set it through `SECRET_KEY`.
 */
function bootstrap(): void {
  const logger = new Logger('SignToken');
  const [keyId, accountId, referenceId, secretFromArg] = process.argv.slice(2);
  const secretKey = secretFromArg ?? process.env.SECRET_KEY;

  if (!keyId || !accountId || !referenceId || !secretKey) {
    logger.error(
      'Usage: npm run token:sign -- <key_id> <account_id> <reference_id> [secret_key]',
    );
    logger.error(
      '   or: $env:SECRET_KEY="sk_translator_..."; npm run token:sign -- <key_id> <account_id> <reference_id>',
    );
    process.exit(1);
  }

  const ttl = configuration().security.signatureTokenTtl;
  const token = signHs256Token(
    { account_id: accountId, reference_id: referenceId },
    secretKey,
    ttl,
  );

  logger.log(`key_id       : ${keyId}`);
  logger.log(`account_id   : ${accountId}`);
  logger.log(`reference_id : ${referenceId}`);
  logger.log(`expires in   : ${ttl}s`);
  process.stdout.write(`Bearer token : ${token}\n`);
}

bootstrap();
