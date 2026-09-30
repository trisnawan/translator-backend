import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { verifyHs256Token } from '../common/utils/jwt.util';
import configuration from '../config/configuration';

/**
 * `npm run callback:listen`
 *
 * Development helper that mimics a client application: it listens on
 * `CALLBACK_PORT` (4000 by default) and verifies every incoming callback exactly
 * the way a real integration must do it:
 *
 * 1. read the `key_id` header and look up the shared `secret_key`;
 * 2. verify the `Authorization: Bearer` token with that secret;
 * 3. compare `reference_id` from the token payload with the body.
 *
 * Set `CALLBACK_SECRET` when the key you are testing with is not the seeded one.
 */
const port = Number(process.env.CALLBACK_PORT ?? 4000);
const logger = new Logger('CallbackReceiver');

const server = createServer(
  (request: IncomingMessage, response: ServerResponse) => {
    const chunks: Buffer[] = [];

    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const rawBody = Buffer.concat(chunks).toString('utf8');
      logger.log(
        `${request.method} ${request.url} key_id=${String(request.headers.key_id ?? '-')}`,
      );

      try {
        const body = JSON.parse(rawBody || '{}') as { reference_id?: string };
        const token = String(request.headers.authorization ?? '').replace(
          /^Bearer\s+/i,
          '',
        );
        const secret = process.env.CALLBACK_SECRET ?? '';
        const payload = secret ? verifyHs256Token(token, secret) : null;

        if (payload && payload.reference_id !== body.reference_id) {
          throw new Error('reference_id of the token does not match the body');
        }

        logger.log(`Body: ${JSON.stringify(body)}`);
        logger.log(
          payload
            ? 'Signature verified ✔'
            : 'CALLBACK_SECRET is not set, signature NOT verified',
        );

        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ received: true }));
      } catch (error) {
        logger.error(`Callback rejected: ${(error as Error).message}`);
        response.writeHead(401, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            received: false,
            message: (error as Error).message,
          }),
        );
      }
    });
  },
);

server.listen(port, () => {
  logger.log(
    `Callback receiver listening on http://localhost:${port}${new URL(configuration().app.url).pathname === '/' ? '' : ''}`,
  );
  logger.log(
    'Set CALLBACK_SECRET to verify the JWT signature of incoming callbacks',
  );
});
