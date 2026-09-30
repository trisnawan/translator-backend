import { createHmac, timingSafeEqual } from 'crypto';

export interface Hs256TokenPayload {
  [key: string]: unknown;
  iat?: number;
  exp?: number;
}

function base64UrlEncode(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

/**
 * Minimal HS256 JWT signer, used by the `token:sign` script and by the callback
 * receiver example so the client integration can be reproduced without pulling
 * a JWT library (any standard JWT library produces/accepts the same token).
 */
export function signHs256Token(
  payload: Hs256TokenPayload,
  secret: string,
  ttlSeconds: number,
): string {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64UrlEncode(
    JSON.stringify({
      ...payload,
      iat: issuedAt,
      exp: issuedAt + ttlSeconds,
    }),
  );
  const signature = createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url');

  return `${header}.${body}.${signature}`;
}

/** Verifies the signature and the expiration of an HS256 token. */
export function verifyHs256Token<
  T extends Hs256TokenPayload = Hs256TokenPayload,
>(token: string, secret: string): T {
  const [header, body, signature] = token.split('.');

  if (!header || !body || !signature) {
    throw new Error('Malformed token');
  }

  const expected = createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url');
  const received = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    received.length !== expectedBuffer.length ||
    !timingSafeEqual(received, expectedBuffer)
  ) {
    throw new Error('Invalid token signature');
  }

  const payload = JSON.parse(base64UrlDecode(body)) as T;
  const now = Math.floor(Date.now() / 1000);

  if (typeof payload.exp === 'number' && payload.exp < now) {
    throw new Error('Token expired');
  }

  return payload;
}

/** Decodes the payload without verifying the signature (debugging helper). */
export function decodeTokenPayload<
  T extends Hs256TokenPayload = Hs256TokenPayload,
>(token: string): T {
  const body = token.split('.')[1];

  if (!body) {
    throw new Error('Malformed token');
  }

  return JSON.parse(base64UrlDecode(body)) as T;
}
