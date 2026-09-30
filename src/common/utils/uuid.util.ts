import { randomBytes } from 'crypto';
import { ValueTransformer } from 'typeorm';

/** Matches any canonical UUID (v1 - v8) in its textual representation. */
export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Generates a UUIDv7 (RFC 9562): 48 bits of unix timestamp in milliseconds
 * followed by random data. The timestamp prefix keeps primary keys clustered in
 * chronological order which is friendlier for B-Tree indexes than UUIDv4.
 */
export function uuidv7(date: Date = new Date()): string {
  const bytes = randomBytes(16);
  let timestamp = BigInt(date.getTime());

  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = Number(timestamp & 0xffn);
    timestamp >>= 8n;
  }

  // Version 7 + RFC 4122 variant.
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  return formatUuid(bytes);
}

/** Formats 16 raw bytes into the canonical `8-4-4-4-12` representation. */
export function formatUuid(bytes: Buffer): string {
  const hex = bytes.toString('hex');

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

/** Converts a textual UUID into the 16 bytes stored in the database. */
export function uuidToBuffer(uuid: string): Buffer {
  const normalized = uuid.replace(/-/g, '').toLowerCase();

  if (normalized.length !== 32 || !/^[0-9a-f]{32}$/.test(normalized)) {
    throw new Error(`Invalid UUID value: ${uuid}`);
  }

  return Buffer.from(normalized, 'hex');
}

/** Converts the 16 bytes coming from the database back into a textual UUID. */
export function bufferToUuid(buffer: Buffer): string {
  return formatUuid(buffer);
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

/** Normalizes a UUID for display (lowercase, canonical form). */
export function normalizeUuid(value: string): string {
  return formatUuid(uuidToBuffer(value));
}

/**
 * TypeORM transformer that transparently maps a textual UUID to the
 * `binary(16)` representation used by the MySQL schema.
 */
export const uuidBinaryTransformer: ValueTransformer = {
  to(value?: string | Buffer | null): Buffer | null | undefined {
    if (value === undefined || value === null) {
      return value;
    }

    return Buffer.isBuffer(value) ? value : uuidToBuffer(value);
  },
  from(value?: Buffer | string | null): string | null | undefined {
    if (value === undefined || value === null) {
      return value;
    }

    return Buffer.isBuffer(value) ? bufferToUuid(value) : String(value);
  },
};
