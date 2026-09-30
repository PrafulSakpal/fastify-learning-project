# Rate Limiting

## What is it?

Capping how many requests a client can make in a time window, rejecting the
rest with `429 Too Many Requests`. This project uses `@fastify/rate-limit`,
backed by Redis so counts are persistent and would be shared correctly
across multiple app instances (rather than the plugin's default in-memory
store, which is per-process).

## Why does this project rate-limit login specifically?

A generous global default (100/minute) covers the whole app — rarely hit in
normal use, mostly a guard against accidental abuse/loops. `POST /auth/login`
gets a **much** stricter override (5/minute) because it's the one endpoint
where an attacker gains something from many rapid attempts: brute-forcing or
credential-stuffing a password. Every other route doesn't have that same
specific risk profile, so it isn't worth the same restriction.

## How it works

```typescript
// src/plugins/rate-limit.ts — the global default
app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  redis: app.redis,
});
```

```typescript
// src/modules/auth/auth.routes.ts — a stricter per-route override
app.post(
  '/auth/login',
  { schema: loginSchema, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
  async (request, reply) => { /* ... */ },
);
```

The `config.rateLimit` object is the same route-level `config` option
introduced back in [07-route-options.md](../fastify/07-route-options.md) —
rate limiting is just another consumer of it, not a special case.

## Application example

Verified directly: the 6th login attempt within a minute is rejected, while
every other route stays unaffected:

```bash
# 5 rapid attempts: all 401 (wrong credentials, but allowed through)
# 6th attempt:
curl -X POST http://localhost:3000/auth/login -d '{"email":"x","password":"y"}'
# {"success":false,"error":{"code":"RATE_LIMITED","message":"Rate limit exceeded, retry in 52 seconds"}}

curl http://localhost:3000/   # still 200 — the login-specific limit doesn't apply here
```

## A real bug this project hit while building this

`@fastify/rate-limit` throws a plain `Error` with only `statusCode: 429` set
— **no `.code` property at all** (confirmed by reading its source after
seeing the actual response). The app's existing generic
`error.statusCode < 500` passthrough (added in Phase 3, reused in Phase 5
for `@fastify/jwt`'s errors) would have handled the status code correctly
but labeled it with the generic fallback `code: 'BAD_REQUEST'` — technically
not wrong, but a worse, less specific label than the situation deserves.
Fixed by adding a dedicated branch in
[error-handler.ts](../../src/plugins/error-handler.ts) for `statusCode === 429`
that reports `code: 'RATE_LIMITED'` instead — verified before/after:

```text
before: {"code":"BAD_REQUEST","message":"Rate limit exceeded, retry in 52 seconds"}
after:  {"code":"RATE_LIMITED","message":"Rate limit exceeded, retry in 52 seconds"}
```

The lesson: a generic error passthrough is a good default, but it's still
worth checking whether a specific, common case (like 429) deserves its own
named branch rather than falling into the catch-all.

## Important details

- **The Redis-backed store matters for correctness, not just persistence.**
  The default in-memory store counts requests per *process* — meaningless
  once an app runs as more than one instance behind a load balancer (Phase 8
  territory), since each instance would allow its own separate quota. A
  shared Redis store enforces one real limit across all instances.
- `@fastify/rate-limit` depends on `app.redis` already being decorated —
  this project's `rate-limit.ts` plugin declares
  `dependencies: ['redis']` via `fastify-plugin` (see
  [10-plugins.md](../fastify/10-plugins.md)) so a registration-order mistake
  fails loudly at startup instead of silently misbehaving.

## Common mistakes

- Applying the same strict limit everywhere instead of tuning it per-route
  based on actual risk (a login endpoint vs. a public read-only listing).
- Using the default in-memory store in a multi-instance deployment and being
  surprised the limit isn't actually being enforced as configured.
- Assuming every plugin's thrown error has both a `.code` and a `.statusCode`
  — verify rather than assume, as this project's own rate-limit fix shows.

## Best practices

- Set a generous global default and override it per-route only where the
  risk profile is actually different — don't over-restrict routes that
  don't need it.
- Back the store with Redis (or another shared store) as soon as more than
  one app instance is a possibility.

## Express comparison

Express has no built-in rate limiting — a comparable app reaches for
`express-rate-limit`, with a very similar concept (a store, a window, a max)
but no equivalent of Fastify's route-level `config` object for clean
per-route overrides; per-route limits in Express typically mean applying a
separately configured middleware instance to specific routers/routes.

## Interview questions

1. Why does this app rate-limit `/auth/login` more strictly than other routes?
2. Why does a Redis-backed rate-limit store matter once an app runs as more
   than one instance?
3. What did the actual `@fastify/rate-limit` error object look like, and
   what did that reveal about the app's generic error passthrough?
4. What Fastify route feature does `config: { rateLimit: {...} } }` reuse?

## Interview answer

> Rate limiting caps requests per time window, rejecting the rest with 429.
> This app sets a lenient global default and a much stricter per-route
> override on login specifically, since that's the one endpoint where rapid
> repeated attempts represent a real attack (credential stuffing). The store
> is backed by Redis rather than the default in-memory one, since an
> in-memory count is meaningless once the app runs as more than one
> instance. Building this also surfaced a real gap in the app's generic
> error passthrough: `@fastify/rate-limit`'s error has a `statusCode` but no
> `.code`, so it fell into a generic `BAD_REQUEST` label until a dedicated
> `statusCode === 429` branch was added — a good reminder to verify a
> plugin's actual error shape rather than assume it matches every other one.
