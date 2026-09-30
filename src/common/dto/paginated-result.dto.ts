/** Metadata returned alongside every paginated list response. */
export class PageMeta {
  page!: number;
  limit!: number;
  total!: number;
  totalPages!: number;
  hasNext!: boolean;
  hasPrevious!: boolean;
}

/**
 * Wrapper used by the repositories/services to return a paginated payload.
 * The response interceptor unwraps it into `data` + `meta`.
 */
export class PaginatedResult<T> {
  constructor(
    public readonly items: T[],
    public readonly meta: PageMeta,
  ) {}

  static from<T>(
    items: T[],
    total: number,
    page: number,
    limit: number,
  ): PaginatedResult<T> {
    const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;

    return new PaginatedResult<T>(items, {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrevious: page > 1 && totalPages > 0,
    });
  }
}
