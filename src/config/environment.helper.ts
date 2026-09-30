/**
 * Environment parsing helpers.
 *
 * Every value coming from `process.env` is a string, these helpers convert them
 * into the type the application actually needs while keeping a sane fallback.
 */

export function toBoolean(value: unknown, fallback = false): boolean {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value !== 'string') {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

export function toNumber(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback;
  }

  if (typeof value !== 'string') {
    return fallback;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
}

export function toList(value: unknown, fallback: string[] = []): string[] {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];
  const list = raw
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);

  return list.length > 0 ? list : fallback;
}

export function toString(value: unknown, fallback = ''): string {
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (typeof value !== 'string') {
    return fallback;
  }

  const parsed = value.trim();

  return parsed.length > 0 ? parsed : fallback;
}
