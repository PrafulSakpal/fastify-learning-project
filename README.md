# Fastify Appointment API — A Fastify Learning Project

A small **Appointment Management API**, built in phases, whose real purpose is
to teach Fastify concepts one at a time using a real, working codebase instead
of isolated snippets.

> The business features (users, services, appointments) are intentionally
> simple. The [`docs/`](docs/) directory — one file per Fastify concept, each
> explained end-to-end — is the main deliverable of this project.

**Current status: Phase 6 of 8 complete — this build's full scope.** See
[Roadmap](#roadmap) below.

## Features

- Create/list/view/update/cancel appointments, backed by real users and services ✅
- Simple JWT authentication (register/login/me) ✅
- Request validation and response serialization via JSON Schema ✅
- Redis caching (`GET /services`) + rate limiting (global + a stricter limit on login) ✅
- Background jobs via BullMQ (appointment-created notification + a delayed reminder, with retry) ✅
- Real-time appointment status updates via WebSockets ✅
- Swagger/OpenAPI docs — out of this build's scope (Phase 7)
- Dockerized, behind Nginx, with health checks and graceful shutdown — out of this build's scope (Phase 8)

## Architecture (current — through Phase 6, this build's full scope)

```text
Client
  ↓
Fastify instance (src/app.ts) — JSON-schema-to-TS type provider
  ↓
Global plugins: request-timing, error-handler, database, jwt, redis, rate-limit, websocket
  ↓            (all fastify-plugin — apply everywhere)
Route plugins (src/modules/*) — schema-validated request/response
  ↓          ↳ services: Redis cache-aside (GET), cache invalidation (POST/PATCH/DELETE)
  ↓          ↳ appointments: enqueues BullMQ jobs (POST), broadcasts over WebSocket (PATCH/DELETE)
  ↓          ↳ auth: register/login (rate-limited) + me (preHandler: [app.authenticate])
Prisma (app.prisma, driver adapter) → PostgreSQL (Docker)
Redis (app.redis: cache + rate-limit store) — separate connections for BullMQ (Docker)
                                                          ↓
                                        src/worker.ts — a SEPARATE process (`npm run worker`)
```

## Technology stack

| Concern | Choice | Added in |
|---|---|---|
| Runtime | Node.js 20+ | Phase 1 |
| Framework | Fastify v5 | Phase 1 |
| Language | TypeScript (strict) | Phase 1 |
| Database | PostgreSQL 16 + Prisma 7 (driver adapter: `@prisma/adapter-pg`) | Phase 4 |
| Auth | JWT (`@fastify/jwt`) + Node's built-in `scrypt` for password hashing | Phase 5 |
| Cache / rate limiting | Redis 7 (`@fastify/redis`, `@fastify/rate-limit`) | Phase 6 |
| Background jobs | BullMQ (own Redis connections via `ioredis`) | Phase 6 |
| Real-time | WebSockets (`@fastify/websocket`) | Phase 6 |
| Tests | Vitest + `fastify.inject()` | Phase 7 |
| API docs | Swagger / OpenAPI (`@fastify/swagger`) | Phase 7 |
| Containers | Docker + Docker Compose | Phase 8 |
| Reverse proxy | Nginx | Phase 8 |

## Folder structure

```text
src/
├── app.ts              # builds the Fastify instance
├── server.ts            # entry point: builds app, starts listening
├── worker.ts             # SEPARATE entry point: `npm run worker`
├── config/              # environment/config
├── plugins/              # fastify.register()-able cross-cutting plugins
│   ├── request-timing.ts
│   ├── error-handler.ts
│   ├── database.ts       # Prisma client, decorated as app.prisma
│   ├── jwt.ts             # @fastify/jwt + app.authenticate
│   ├── redis.ts           # @fastify/redis, decorated as app.redis
│   ├── rate-limit.ts      # @fastify/rate-limit, backed by app.redis
│   └── websocket.ts       # @fastify/websocket + app.broadcastAppointmentUpdate
├── modules/              # one folder per business resource
│   ├── users/
│   ├── services/          # Redis-cached GET /services
│   ├── appointments/       # enqueues BullMQ jobs, broadcasts over WebSocket
│   └── auth/              # register/login (rate-limited)/me
├── common/               # shared schemas, errors, types, utils (password hashing)
└── jobs/                 # BullMQ: connection.ts, notification.queue.ts, notification.worker.ts
prisma/                    # schema.prisma + migrations
docs/                       # the Fastify learning documentation (see below)
```

See [docs/architecture/project-structure.md](docs/architecture/project-structure.md)
for the full breakdown and rationale.

## Installation

Requires Node.js 20+ and Docker (for PostgreSQL).

```bash
npm install
```

> `npm audit` currently flags 4 high-severity advisories, all inside
> `prisma`'s own dev-only tooling dependencies (`mysql2`, used for
> multi-database introspection this project never touches, since it's
> Postgres-only). See [docs/database/prisma.md](docs/database/prisma.md)
> for the verified detail — not something an app-level fix can resolve
> upstream of Prisma's own release.

## Environment setup

```bash
cp .env.example .env
```

```bash
PORT=3000
HOST=0.0.0.0
DATABASE_URL="postgresql://fastify:fastify@localhost:5433/appointment_api?schema=public"
JWT_SECRET="<any long random string in development>"
REDIS_URL="redis://localhost:6381"
```

## Database & Redis setup

```bash
npm run db:up         # docker compose up -d — starts BOTH postgres and redis
npm run db:migrate     # applies prisma/migrations/ to the database
npm run db:generate    # regenerates the typed Prisma client — always run
                        # this explicitly after any schema.prisma change;
                        # see docs/database/prisma.md for why this project
                        # doesn't rely on db:migrate to do it automatically
```

`npm run db:studio` opens Prisma Studio, a GUI for browsing/editing rows.

## Running the application

Two separate processes — the API, and the BullMQ worker that actually sends
notifications (see [docs/queues/workers.md](docs/queues/workers.md) for why
they're separate):

```bash
npm run dev      # the Fastify API — tsx watch, loads .env
npm run worker   # the BullMQ worker — separate terminal, also loads .env
```

```bash
npm run build   # compiles to dist/ via tsc
npm start       # runs the compiled app (node dist/server.js), loads .env
```

Try it:

```bash
curl http://localhost:3000/

# register + log in
curl -X POST http://localhost:3000/auth/register -H "Content-Type: application/json" \
  -d '{"name":"Jane Doe","email":"jane@example.com","password":"correct-horse-battery"}'
curl -X POST http://localhost:3000/auth/login -H "Content-Type: application/json" \
  -d '{"email":"jane@example.com","password":"correct-horse-battery"}'
# → { "accessToken": "...", "expiresIn": "1h" }

curl http://localhost:3000/auth/me -H "Authorization: Bearer <accessToken>"
curl http://localhost:3000/auth/me   # no token → 401, same error envelope as everything else

# create a service, then an appointment referencing the registered user
curl -X POST http://localhost:3000/services -H "Content-Type: application/json" \
  -d '{"name":"Haircut","duration":30,"price":25.50}'
curl -X POST http://localhost:3000/appointments -H "Content-Type: application/json" \
  -d '{"userId":"<user-id>","serviceId":"<service-id>","date":"2026-10-05","startTime":"09:00","endTime":"09:30"}'

curl http://localhost:3000/appointments
curl http://localhost:3000/appointments/stats/summary

# double-booking the same service/date/startTime → 409 (a real DB constraint)
# validation error → consistent { success:false, error:{...} } shape
curl -X POST http://localhost:3000/appointments -H "Content-Type: application/json" -d '{"userId":"x"}'

# cancel (soft delete — sets status to CANCELLED) → also broadcasts over WebSocket
curl -X DELETE http://localhost:3000/appointments/<id>

# Redis caching — watch the x-cache header flip MISS → HIT → MISS
curl -i http://localhost:3000/services   # x-cache: MISS
curl -i http://localhost:3000/services   # x-cache: HIT
curl -X PATCH http://localhost:3000/services/<id> -d '{"price":75}'
curl -i http://localhost:3000/services   # x-cache: MISS again (invalidated)

# rate limiting — the 6th login attempt within a minute gets 429
for i in 1 2 3 4 5 6; do curl -s -X POST http://localhost:3000/auth/login \
  -d '{"email":"x","password":"y"}'; echo; done
```

Every response includes an `x-response-time-ms` header (see
[src/plugins/request-timing.ts](src/plugins/request-timing.ts)). Creating an
appointment enqueues a BullMQ job — watch `npm run worker`'s terminal for the
notification (with a deliberate first-attempt failure demonstrating retry)
and, ~10s later, the delayed reminder job.

## Documentation

Start here: [docs/README.md](docs/README.md) (full index) and
[docs/FASTIFY-LEARNING-PATH.md](docs/FASTIFY-LEARNING-PATH.md) (recommended
reading order, level by level).

## Roadmap

| Phase | Focus | Status |
|---|---|---|
| 1 | Fastify setup — instance, TypeScript, basic routes, request/reply | ✅ Done |
| 2 | Core Fastify — route options, hooks, lifecycle, plugins, decorators, encapsulation | ✅ Done |
| 3 | Validation — JSON Schema, request validation, response schemas, error handling | ✅ Done |
| 4 | Application — PostgreSQL, Prisma, users, services, appointments | ✅ Done |
| 5 | Authentication — JWT, login, auth hook, `request.user` | ✅ Done |
| 6 | Advanced Fastify — Redis, BullMQ, WebSockets | ✅ Done |
| 7 | Testing & API docs — Vitest, `fastify.inject()`, Swagger | Not in current build scope |
| 8 | Production — logging, health checks, graceful shutdown, Docker, Nginx, performance | Not in current build scope |

**This build's scope ends here, at Phase 6.** Phases 7 and 8 were
deliberately not requested for this build — see
[docs/FASTIFY-LEARNING-PATH.md](docs/FASTIFY-LEARNING-PATH.md) for what each
would add if picked up later.
