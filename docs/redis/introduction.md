# Redis — Introduction

## What is it?

An in-memory key-value store, used in this project for two things:
**response caching** ([caching.md](caching.md)) and as the **persistent
store for rate limiting** ([rate-limiting.md](rate-limiting.md)). Fastify
talks to it via `@fastify/redis`, decorating the app with `app.redis` — an
ioredis client.

## Why Redis for this project?

Both use cases share the same requirement: fast, shared, TTL-aware storage
that isn't the primary database. Postgres could technically do either job,
but Redis is purpose-built for it — reads/writes are in-memory (far faster
than a round trip to Postgres for a cache lookup), and its native key
expiry (`EX`) is exactly what a cache or a rate-limit window needs.

## How it's run for this project

A second service in [docker-compose.yml](../../docker-compose.yml), next to
`postgres`:

```yaml
redis:
  image: redis:7-alpine
  ports:
    - '6381:6379'
  volumes:
    - redis_data:/data
```

Port `6381` (not the default `6379`) avoids colliding with any other Redis
instance already running locally — the same reasoning as Postgres's
non-default port (see [postgres.md](../database/postgres.md)). Started with
`npm run db:up` (now brings up both services).

## How it's wired into the app

[src/plugins/redis.ts](../../src/plugins/redis.ts) — a `fastify-plugin`,
because `app.redis` needs to be visible to every module (services for
caching, the rate-limit plugin for its store):

```typescript
async function redisPlugin(app: FastifyInstance) {
  app.register(fastifyRedis, { url: env.REDIS_URL });
}
export default fp(redisPlugin, { name: 'redis' });
```

## Important details

- **This is a *different* Redis connection from BullMQ's.** `app.redis`
  (this plugin) is for caching/rate-limiting; BullMQ's `Queue`/`Worker` each
  create their own dedicated connection via
  [src/jobs/connection.ts](../../src/jobs/connection.ts). See
  [queues/bullmq.md](../queues/bullmq.md) for exactly why they can't share one.
- `@fastify/rate-limit` declares a dependency on this plugin's name (`redis`)
  via `fastify-plugin`'s `dependencies` option (see
  [rate-limiting.md](rate-limiting.md)) — Fastify throws a clear startup
  error if the ordering is ever wrong, instead of a confusing runtime
  `app.redis is undefined`.

## Common mistakes

- Assuming Redis is durable storage — it's configured here with a volume
  (survives a container restart), but by default it's an in-memory store
  first; don't put data here that would be unacceptable to lose.
- Forgetting to invalidate a cache key after a write and serving stale data
  indefinitely — see [caching.md](caching.md).

## Best practices

- Give every cache key and TTL a clear purpose — don't cache "just in case."
- Keep cache/rate-limit connections and job-queue connections separate, even
  though they're the same Redis server.

## Express comparison

Not framework-specific — `ioredis` (or `redis`) is the same client whichever
framework it's wired into. `@fastify/redis` is Fastify's thin convenience
wrapper (register once, get `app.redis` everywhere); an Express app would
typically export a standalone client instance from its own module instead.

## Interview questions

1. Why does this project use Redis instead of just querying Postgres for
   the same cached data?
2. Why does `@fastify/rate-limit` need `app.redis`, and what breaks without it?
3. Why do BullMQ and the app's caching layer use separate Redis connections
   even though they point at the same server?

## Interview answer

> Redis serves two purposes in this project: response caching for
> `GET /services` and the persistent store behind rate limiting — both
> benefit from Redis's in-memory speed and native key expiry, which Postgres
> isn't optimized for. `@fastify/redis` registers once and decorates
> `app.redis` everywhere it's needed. It's a completely separate connection
> from the ones BullMQ creates for its queue and worker, since those have
> different connection requirements (blocking commands) that would conflict
> with ordinary cache reads/writes on a shared connection.
