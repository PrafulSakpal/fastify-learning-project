/**
 * Shared `page`/`limit` querystring shape, reused by every list endpoint
 * (users, services, appointments) so pagination behaves identically
 * everywhere instead of being redefined slightly differently per module.
 */
export const paginationProperties = {
  page: { type: 'integer', minimum: 1, default: 1 },
  limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
} as const;
