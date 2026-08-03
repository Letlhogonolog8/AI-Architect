import type { Paginated, PaginationMeta, PaginationQuery } from '@aegisdrive/types';
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../constants';

/** Clamps caller-supplied paging into the range the database is tuned for. */
export function normalisePagination(query: Partial<PaginationQuery> = {}): PaginationQuery {
  const page = Math.max(DEFAULT_PAGE, Math.trunc(query.page ?? DEFAULT_PAGE));
  const requested = Math.trunc(query.pageSize ?? DEFAULT_PAGE_SIZE);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, requested));

  return {
    page,
    pageSize,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder ?? 'desc',
  };
}

/** Converts a normalised page into the `skip`/`take` a Prisma query needs. */
export function toSkipTake(query: PaginationQuery): { skip: number; take: number } {
  return { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
}

export function buildPaginationMeta(query: PaginationQuery, totalItems: number): PaginationMeta {
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / query.pageSize);
  return {
    page: query.page,
    pageSize: query.pageSize,
    totalItems,
    totalPages,
    hasNextPage: query.page < totalPages,
    hasPreviousPage: query.page > 1 && totalPages > 0,
  };
}

export function paginate<T>(items: T[], query: PaginationQuery, totalItems: number): Paginated<T> {
  return { items, meta: buildPaginationMeta(query, totalItems) };
}
