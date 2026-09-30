# Fastify Learning Path

This project teaches Fastify in six levels, matching the phase-based build order
of the application. Each level builds on the previous one — don't skip ahead.

```text
Level 1 — Fundamentals
    ↓
Fastify instance
Routes
Request
Reply

Level 2 — Core Fastify
    ↓
Lifecycle
Hooks
Plugins
Encapsulation
Decorators

Level 3 — Validation
    ↓
JSON Schema
Validation
Serialization

Level 4 — Application
    ↓
Database
Authentication
Error handling
Logging

Level 5 — Advanced
    ↓
Redis
BullMQ
WebSockets
Testing

Level 6 — Production
    ↓
Docker
Nginx
Performance
Graceful shutdown
Health checks
```

## Status

| Level | Status | Docs |
|---|---|---|
| 1 — Fundamentals | ✅ Done | [01](fastify/01-what-is-fastify.md) · [02](fastify/02-project-setup.md) · [03](fastify/03-fastify-instance.md) · [04](fastify/04-routes.md) · [05](fastify/05-request.md) · [06](fastify/06-reply.md) |
| 2 — Core Fastify | ✅ Done | [07](fastify/07-route-options.md) · [08](fastify/08-hooks.md) · [09](fastify/09-lifecycle.md) · [10](fastify/10-plugins.md) · [11](fastify/11-encapsulation.md) · [12](fastify/12-decorators.md) · [18](fastify/18-middleware.md) |
| 3 — Validation | ✅ Done | [13](fastify/13-json-schema.md) · [14](fastify/14-validation.md) · [15](fastify/15-serialization.md) · [16](fastify/16-error-handling.md) |
| 4 — Application | ✅ Done | [17](fastify/17-logging.md) · [database/postgres](database/postgres.md) · [database/prisma](database/prisma.md) · [database/connection-management](database/connection-management.md) · [database/transactions](database/transactions.md) · [19](fastify/19-cookies.md) · [20](fastify/20-jwt.md) |
| 5 — Advanced | 🔶 In progress | Redis + BullMQ + WebSockets done: [redis/introduction](redis/introduction.md) · [redis/caching](redis/caching.md) · [redis/rate-limiting](redis/rate-limiting.md) · [queues/bullmq](queues/bullmq.md) · [queues/workers](queues/workers.md) · [queues/retry](queues/retry.md) · [queues/delayed-jobs](queues/delayed-jobs.md) · [21](fastify/21-websockets.md). Testing is Phase 7, outside this build's scope. |
| 6 — Production | Not in current build scope | Docker/Nginx/performance/graceful shutdown/health checks are Phase 8, outside this build's scope |

See [docs/README.md](README.md) for the full documentation index.

This build's scope stops at the end of Phase 6 (see the root
[README.md](../README.md)'s Roadmap) — Level 5's "Testing" and all of
Level 6 ("Production") are documented here only as forward pointers to
what a Phase 7/8 build would add, not as implemented, verified content.
