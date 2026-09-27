const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
}

export interface PaginationQuery {
  page?: number;
  pageSize?: number;
}

export interface PaginationParams {
  page: number;
  skip: number;
  take: number;
}

export function resolvePagination(query: PaginationQuery): PaginationParams {
  const page = query.page ?? 1;
  const pageSize = Math.min(query.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  return { page, skip: (page - 1) * pageSize, take: pageSize };
}
