# Documentation Index

This `docs/` directory is the primary deliverable of this project. The application
(a small Appointment Management API) exists mainly to give every Fastify concept a
real, working example — not the other way around.

See [FASTIFY-LEARNING-PATH.md](FASTIFY-LEARNING-PATH.md) for the recommended reading order.

## Fastify concepts (`fastify/`)

| File | Topic | Phase |
|---|---|---|
| [01-what-is-fastify.md](fastify/01-what-is-fastify.md) | What is Fastify, why it exists | 1 |
| [02-project-setup.md](fastify/02-project-setup.md) | TypeScript + project setup | 1 |
| [03-fastify-instance.md](fastify/03-fastify-instance.md) | The Fastify instance, `listen`/`ready`/`close`/`inject` | 1 |
| [04-routes.md](fastify/04-routes.md) | Route methods, `app.route()` | 1 |
| [05-request.md](fastify/05-request.md) | The request object | 1 |
| [06-reply.md](fastify/06-reply.md) | The reply object | 1 |
| [07-route-options.md](fastify/07-route-options.md) | Full route option object | 2 |
| [08-hooks.md](fastify/08-hooks.md) | Hooks | 2 |
| [09-lifecycle.md](fastify/09-lifecycle.md) | Request/response lifecycle | 2 |
| [10-plugins.md](fastify/10-plugins.md) | Plugins & `fastify-plugin` | 2 |
| [11-encapsulation.md](fastify/11-encapsulation.md) | Encapsulation | 2 |
| [12-decorators.md](fastify/12-decorators.md) | Decorators | 2 |
| [13-json-schema.md](fastify/13-json-schema.md) | JSON Schema | 3 |
| [14-validation.md](fastify/14-validation.md) | Request validation | 3 |
| [15-serialization.md](fastify/15-serialization.md) | Response serialization | 3 |
| [16-error-handling.md](fastify/16-error-handling.md) | Error handling | 3 |
| [17-logging.md](fastify/17-logging.md) | Logging | 4 |
| [18-middleware.md](fastify/18-middleware.md) | Middleware vs hooks vs plugins | 2 |
| [19-cookies.md](fastify/19-cookies.md) | Cookies (standalone — not used by this app's auth) | 5 |
| [20-jwt.md](fastify/20-jwt.md) | JWT authentication | 5 |
| [21-websockets.md](fastify/21-websockets.md) | WebSockets | 6 |
| 22-testing.md | Testing with `inject()` | 7 |
| 23-swagger.md | Swagger/OpenAPI | 7 |
| 24-performance.md | Performance | 8 |
| 25-graceful-shutdown.md | Graceful shutdown | 8 |
| 26-health-checks.md | Health checks | 8 |

## Other areas

- `database/` — [postgres.md](database/postgres.md), [prisma.md](database/prisma.md),
  [connection-management.md](database/connection-management.md),
  [transactions.md](database/transactions.md) (Phase 4)
- `redis/` — [introduction.md](redis/introduction.md), [caching.md](redis/caching.md),
  [rate-limiting.md](redis/rate-limiting.md) (Phase 6)
- `queues/` — [bullmq.md](queues/bullmq.md), [workers.md](queues/workers.md),
  [retry.md](queues/retry.md), [delayed-jobs.md](queues/delayed-jobs.md) (Phase 6)
- `architecture/` — project structure, request flow, application flow
- `testing/` — testing guide (Phase 7)
- `deployment/` — Docker, Nginx, production (Phase 8)
- `examples/` — small standalone, runnable `.ts` files for concepts that don't
  belong in the main app: [lifecycle-example.ts](examples/lifecycle-example.ts),
  [hooks-example.ts](examples/hooks-example.ts),
  [plugin-example.ts](examples/plugin-example.ts),
  [encapsulation-example.ts](examples/encapsulation-example.ts),
  [decorator-example.ts](examples/decorator-example.ts).
  Run any of them with `npx tsx docs/examples/<file>.ts`.
- `interview/` — interview-style Q&A for every concept covered

Files not yet written are listed above for context; they are created as their phase
is built, so the docs never describe code that doesn't exist yet.
