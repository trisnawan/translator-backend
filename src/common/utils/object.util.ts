/**
 * Small helpers for DTO <-> entity mapping.
 */

/** Removes `undefined` (and optionally `null`) entries so TypeORM does not overwrite untouched columns. */
export function pickDefined<T extends Record<string, unknown>>(
  source: T,
  options: { includeNull?: boolean } = {},
): Partial<T> {
  const includeNull = options.includeNull ?? false;

  return Object.entries(source).reduce<Partial<T>>((result, [key, value]) => {
    if (value === undefined || (!includeNull && value === null)) {
      return result;
    }

    result[key as keyof T] = value as T[keyof T];

    return result;
  }, {});
}

/** Trims every string value of an object (one level deep). */
export function trimStrings<T extends Record<string, unknown>>(source: T): T {
  return Object.entries(source).reduce<Record<string, unknown>>(
    (result, [key, value]) => {
      result[key] = typeof value === 'string' ? value.trim() : value;

      return result;
    },
    {},
  ) as T;
}

export function normalizeOptionalString(value?: string | null): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}
