# Redis Caching

## What is it?

The **cache-aside pattern**: on a read, check Redis first; on a hit, return
that; on a miss, read the real source (Postgres via Prisma), then write the
result into Redis before returning it. Writes that change the underlying
data invalidate (delete) the cached key so the next read is forced to miss
and repopulate.

```text
GET /services
      ↓
   Redis
      ↓
Cache hit → return
      ↓
Cache miss
      ↓
 PostgreSQL
      ↓
   Redis (store)
```

## Why does this project cache `GET /services`?

Services (haircuts, massages, etc.) change rarely compared to how often
they're read — a natural fit for caching. Appointments, by contrast, change
constantly (created, updated, cancelled) and are usually read with
different filters per request, making them a poor caching candidate for
this simple app — which is exactly why only `/services` is cached here, not
every list endpoint.

## How it works

```typescript
// src/modules/services/service.routes.ts
app.get('/services', { schema: listServicesSchema }, async (request, reply) => {
  const { page, limit } = request.query;

  const cached = await app.redis.get('services:list');
  let allServices;

  if (cached) {
    allServices = JSON.parse(cached);
    reply.header('x-cache', 'HIT');
  } else {
    const services = await app.prisma.service.findMany({ orderBy: { createdAt: 'asc' } });
    allServices = services.map(toServiceResponse);
    await app.redis.set('services:list', JSON.stringify(allServices), 'EX', 60);
    reply.header('x-cache', 'MISS');
  }

  const start = (page - 1) * limit;
  return reply.code(200).send(allServices.slice(start, start + limit));
});
```

Every mutation (`POST`/`PATCH`/`DELETE /services*`) calls
`await app.redis.del('services:list')` right after the Prisma write.

## Application example

Verified directly against the running app:

```bash
curl -i http://localhost:3000/services   # x-cache: MISS  (queries Postgres, populates Redis)
curl -i http://localhost:3000/services   # x-cache: HIT   (served entirely from Redis)

curl -X PATCH http://localhost:3000/services/<id> -d '{"price":75}'
curl -i http://localhost:3000/services   # x-cache: MISS again — invalidated by the PATCH
```

## Important details

- **The cache stores the *response-shaped* data, not raw Prisma rows.**
  `services.map(toServiceResponse)` runs *before* `JSON.stringify` — so a
  cached entry already has `price` as a string and dates as ISO strings,
  identical to what a fresh DB read produces after its own mapping. Caching
  raw Prisma objects instead would mean the cache-hit and cache-miss code
  paths return subtly different shapes (a real, easy-to-miss bug class).
- **One cache key for the whole list, paginated in memory** — chosen
  specifically to avoid a combinatorial explosion of cache keys per
  `page`/`limit` combination (and the invalidation complexity of tracking
  all of them). This only works because this app's service catalog is
  small; a large, frequently-paginated dataset would need a different
  strategy (e.g., caching only the first page, or not caching list
  pagination at all).
- **TTL as a safety net, invalidation as the primary mechanism.** The `EX 60`
  TTL means even a missed invalidation (a bug, or a write that bypassed this
  route) self-heals within 60 seconds — defense in depth, not the only
  correctness guarantee.

## Common mistakes

- Forgetting to invalidate the cache on every mutation path (create, update,
  *and* delete) — missing even one leaves stale data for up to the TTL.
- Caching raw database rows instead of the already-mapped response shape,
  producing different output depending on whether a request hit the cache.
- Caching data that changes on every read anyway (no benefit) or data where
  staleness is unacceptable even briefly (a correctness bug, not a
  performance win).

## Best practices

- Cache the exact shape you're going to send back, computed once.
- Pair every mutation to a resource with an explicit cache invalidation for
  that resource's cache key(s) — don't rely on TTL alone as the plan.
- Make cache hits observable (this project's `x-cache` header) so caching
  behavior can be verified in tests/manually instead of trusted blindly.

## Express comparison

Not framework-specific — the cache-aside pattern is identical regardless of
framework; what differs is just how the Redis client is made available to a
route (`app.redis` here via a decorator vs. an imported singleton module in
a typical Express app).

## Interview questions

1. What is the cache-aside pattern, step by step?
2. Why does this project cache the already-mapped response shape instead of
   raw Prisma rows?
3. What are the two things keeping this cache correct, and which one is the
   primary mechanism vs. the safety net?
4. Why is `GET /appointments` not cached the same way `GET /services` is?

## Interview answer

> `GET /services` uses the cache-aside pattern: check Redis first, fall back
> to Postgres on a miss, then populate Redis before responding. The cache
> stores the exact response-shaped JSON (post-mapping, with dates/Decimal
> already converted to strings) rather than raw Prisma objects, so a cache
> hit and a cache miss return byte-identical shapes. Every mutation to
> services explicitly deletes the cache key, which is the primary
> correctness mechanism; a 60-second TTL is a secondary safety net in case
> an invalidation is ever missed. Appointments aren't cached the same way
> since they change far more often and are read with more varied filters,
> making the same one-key strategy a poor fit.
