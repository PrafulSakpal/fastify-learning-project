# Project Structure (through Phase 6 — this build's full scope)

```text
fastify-application/
├── prisma/
│   ├── schema.prisma           # User, Service, Appointment models
│   └── migrations/              # one folder per applied migration
├── prisma.config.ts             # CLI-only: connection string for migrate/generate/studio
├── docker-compose.yml           # postgres + redis services
├── .env.example                 # documented, safe-to-commit template
├── src/
│   ├── app.ts                 # builds the Fastify instance (no listen())
│   ├── server.ts              # entry point: builds app, calls listen()
│   ├── worker.ts               # SEPARATE entry point — the BullMQ consumer process
│   ├── config/
│   │   └── env.ts             # reads PORT/HOST/JWT_SECRET/REDIS_URL from process.env
│   ├── plugins/
│   │   ├── request-timing.ts   # global hook + decorator, via fastify-plugin
│   │   ├── error-handler.ts    # global setErrorHandler/setNotFoundHandler, via fastify-plugin
│   │   ├── database.ts         # Prisma client → app.prisma, via fastify-plugin
│   │   ├── jwt.ts               # @fastify/jwt + app.authenticate, via fastify-plugin
│   │   ├── redis.ts             # @fastify/redis → app.redis, via fastify-plugin
│   │   ├── rate-limit.ts        # @fastify/rate-limit, backed by app.redis
│   │   └── websocket.ts         # @fastify/websocket + app.broadcastAppointmentUpdate
│   ├── modules/
│   │   ├── users/
│   │   │   ├── user.routes.ts
│   │   │   ├── user.schemas.ts
│   │   │   └── user.mappers.ts   # toUserResponse() — strips password, formats dates
│   │   ├── services/
│   │   │   ├── service.routes.ts   # GET is Redis-cached; writes invalidate the cache
│   │   │   └── service.schemas.ts
│   │   ├── appointments/
│   │   │   ├── appointment.routes.ts    # enqueues BullMQ jobs; broadcasts over WebSocket
│   │   │   └── appointment.schemas.ts
│   │   └── auth/
│   │       ├── auth.routes.ts    # register/login (rate-limited)/me
│   │       └── auth.schemas.ts
│   ├── common/
│   │   ├── errors/
│   │   │   └── app-error.ts     # thrown, known-shape business errors
│   │   ├── schemas/
│   │   │   ├── error-response.schema.ts  # shared error response shape
│   │   │   └── pagination.schema.ts      # shared page/limit querystring shape
│   │   ├── utils/
│   │   │   └── password.ts       # scrypt hash + timing-safe verify
│   │   └── types/
│   │       └── fastify.d.ts     # module augmentation for our decorators + @fastify/jwt
│   └── jobs/
│       ├── connection.ts          # dedicated ioredis connection factory for BullMQ
│       ├── notification.queue.ts  # the producer: Queue + enqueue helpers
│       └── notification.worker.ts # the consumer: Worker + job processors
├── docs/                        # this documentation
├── package.json
└── tsconfig.json
```

## Why split `app.ts` and `server.ts` — and now `worker.ts` too?

`buildApp()` in `app.ts` only *constructs* the Fastify instance — it never
binds a network port. `server.ts` is the only file that calls `app.listen()`.
This means tests (added in Phase 7) can import `buildApp()` and drive it
with `app.inject()` without ever opening a real socket. See
[03-fastify-instance.md](../fastify/03-fastify-instance.md). Phase 6 extends
the same "separate entry points" idea one step further: `worker.ts` is a
*completely separate process* (`npm run worker`, not part of the Fastify app
at all) — see [docs/queues/workers.md](../queues/workers.md) for why the
BullMQ consumer specifically needs to run apart from the API.

## Why `modules/<resource>/`?

Each business resource (users, services, appointments, auth) gets its own
folder holding everything specific to it — routes and schemas, with no
separate repository/service layer, because Prisma calls in these route
handlers are already thin enough that an extra layer would only add
indirection without improving separation of concerns — introduce an
abstraction only once duplication or complexity actually demands it (which
is exactly why `toUserResponse()` was pulled into its own `user.mappers.ts`
in Phase 5: it's genuinely reused by two different route files now,
`user.routes.ts` and `auth.routes.ts`). This mirrors Fastify's own
plugin-per-concern model rather than the classic Express
`routes/`, `controllers/`, `models/` split by *technical layer*.

## `plugins/` vs. `modules/`

`src/plugins/*` are wrapped in `fastify-plugin` because their whole purpose
is global: `request-timing`, `error-handler`, `database`, `jwt`, `redis`,
`rate-limit`, `websocket` — every one of them adds something (a decorator, a
hook, a global handler) that every route needs access to, not just routes
registered in that same file. `src/modules/*/…routes.ts` files are plain
(encapsulated) plugins, because their hooks and routes are specific to one
resource. See [10-plugins.md](../fastify/10-plugins.md) and
[11-encapsulation.md](../fastify/11-encapsulation.md) for why that split
matters, not just where the files live.

## `jobs/` — three files, three responsibilities

`connection.ts` only knows how to create a correctly-configured Redis
connection (`maxRetriesPerRequest: null`) — it doesn't know about queues or
jobs at all. `notification.queue.ts` is the producer side, imported by
`appointment.routes.ts`. `notification.worker.ts` is the consumer side,
imported only by `src/worker.ts`. This split means the API process (`app.ts`
→ `appointment.routes.ts` → `notification.queue.ts`) never imports anything
from `notification.worker.ts` — it has no idea *how* jobs get processed,
only that it can enqueue them. See [docs/queues/bullmq.md](../queues/bullmq.md).

## `*.routes.ts` vs. `*.schemas.ts`

Each module has two files: routes/handlers, and the JSON Schemas that
validate their input and shape their output. Keeping schemas in their own
file (rather than inlined into every route call) makes them easy to reuse
across routes (e.g. `appointmentResponseSchema` is reused in `response: {200: ...}`
for GET, POST, PATCH, and DELETE) and easy to scan as the module's public
contract. `auth.schemas.ts` goes further and imports `userResponseSchema`
straight from the users module — `/auth/register` and `/auth/me` return
exactly the same "public user" shape as `/users/:id`, so there's one schema
for it, not three near-duplicates. See
[13-json-schema.md](../fastify/13-json-schema.md).

## Where the database actually lives

`prisma/schema.prisma` is the single source of truth for the data model.
`prisma.config.ts` (CLI-only — the running app never imports it) and
`src/plugins/database.ts` (app-only — the CLI never imports it) each get the
same `DATABASE_URL` through two different paths, which is a genuinely
current (Prisma 7) architectural detail, not a design choice made for this
project specifically. See
[docs/database/connection-management.md](../database/connection-management.md).

## Three separate Redis connections, one Redis server

`app.redis` (caching + rate-limiting), the BullMQ `Queue`'s connection, and
the BullMQ `Worker`'s connection all point at the *same* `docker-compose.yml`
Redis instance, but are three distinct ioredis client objects, created for
three different reasons. See [docs/queues/bullmq.md](../queues/bullmq.md)
for exactly why they aren't shared.

## What's left unbuilt (out of this build's scope)

`Phase 7` (Vitest tests, Swagger docs) and `Phase 8` (Docker for the app
itself, Nginx, health checks, graceful shutdown, performance tuning) were
not requested for this build — see the root [README.md](../../README.md)'s
Roadmap. Nothing in `src/` is a placeholder for them; the app is complete
and working as-is through Phase 6.
