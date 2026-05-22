import type { PaginationQueryDto } from '../dto/pagination-query.dto';

export interface PaginationArgs {
  skip: number;
  take: number;
  orderBy: Record<string, 'asc' | 'desc'>;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Converts a PaginationQueryDto into the Prisma skip/take/orderBy args.
 *
 * NOTE: Callers MUST validate that `sortBy` is a known field for their model
 * before passing it here — never pass raw user input directly to orderBy.
 */
export function buildPagination(query: PaginationQueryDto): PaginationArgs {
  const page = query.page ?? 1;
  const limit = query.limit ?? 20;

  return {
    skip: (page - 1) * limit,
    take: limit,
    orderBy: { [query.sortBy ?? 'createdAt']: query.sortOrder ?? 'desc' },
  };
}

export function buildPaginationMeta(page: number, limit: number, total: number): PaginationMeta {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}
