import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

const PAYLOAD_VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

/**
 * Reversible encryption for every secret stored in the database.
 *
 * Format: `v1.<iv>.<authTag>.<cipherText>` (base64url). The key is derived from
 * `APP_ENCRYPTION_KEY` so rotating the environment value requires re-encrypting
 * the stored secrets.
 */
@Injectable()
export class CryptoService {
  private readonly logger = new Logger(CryptoService.name);
  private readonly key: Buffer;

  constructor(private readonly configService: ConfigService) {
    const secret = this.configService.getOrThrow<string>(
      'security.encryptionKey',
    );

    if (secret.trim().length < 16) {
      this.logger.warn(
        'APP_ENCRYPTION_KEY is shorter than 16 characters, please use a long random value',
      );
    }

    // AES-256 requires a 32 bytes key, sha256 gives us a deterministic one.
    this.key = createHash('sha256').update(secret, 'utf8').digest();
  }

  encrypt(plainText: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plainText, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return [
      PAYLOAD_VERSION,
      iv.toString('base64url'),
      authTag.toString('base64url'),
      encrypted.toString('base64url'),
    ].join('.');
  }

  decrypt(payload: string): string {
    if (!this.isEncrypted(payload)) {
      // Value stored before encryption was introduced, keep it working.
      return payload;
    }

    const [version, iv, authTag, encrypted] = payload.split('.');

    if (version !== PAYLOAD_VERSION || !iv || !authTag || !encrypted) {
      throw new Error('Malformed encrypted payload');
    }

    const decipher = createDecipheriv(
      ALGORITHM,
      this.key,
      Buffer.from(iv, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(authTag, 'base64url'));

    return Buffer.concat([
      decipher.update(Buffer.from(encrypted, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  isEncrypted(payload: string | null | undefined): boolean {
    return (
      typeof payload === 'string' && payload.startsWith(`${PAYLOAD_VERSION}.`)
    );
  }

  /** Encrypts the value only when it is not encrypted yet. */
  encryptIfNeeded(payload: string): string {
    return this.isEncrypted(payload) ? payload : this.encrypt(payload);
  }

  /** `sk_live_0123456789` -> `sk_l***********6789`, for logging and API output. */
  static mask(value: string | null | undefined): string | null {
    if (!value) {
      return null;
    }

    if (value.length <= 8) {
      return '*'.repeat(value.length);
    }

    return `${value.slice(0, 4)}${'*'.repeat(Math.min(value.length - 8, 12))}${value.slice(-4)}`;
  }
}
