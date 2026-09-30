# PostgreSQL

## What is it?

The relational database this project persists to. Fastify itself is
database-agnostic — PostgreSQL is a choice this project makes, not something
Fastify requires or even knows about directly.

## Why PostgreSQL for this project?

Appointments, users, and services are inherently relational: an appointment
*belongs to* a user and *belongs to* a service, and those relationships need
to stay consistent (you can't book an appointment for a user that doesn't
exist, or leave an appointment pointing at a deleted service). A relational
database with real foreign keys enforces that at the data layer, not just in
application code.

## How it's run for this project

A single `postgres` service in [docker-compose.yml](../../docker-compose.yml),
scoped to just Postgres for now — Redis and the app's own container are
added in later phases (Phase 6 and Phase 8) rather than all at once:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: fastify
      POSTGRES_PASSWORD: fastify
      POSTGRES_DB: appointment_api
    ports:
      - '5433:5432'
    volumes:
      - postgres_data:/var/lib/postgresql/data
```

Port `5433` (not the default `5432`) is deliberate — it avoids colliding with
any other Postgres instance already running on this machine. Started with:

```bash
npm run db:up        # docker compose up -d postgres
```

The connection string lives in `.env` (see [.env.example](../../.env.example)),
never committed:

```text
DATABASE_URL="postgresql://fastify:fastify@localhost:5433/appointment_api?schema=public"
```

## Important details

- The `postgres_data` named volume means data survives `docker compose down`
  (but not `docker compose down -v`) — the database isn't wiped every time
  the container restarts.
- This project talks to Postgres exclusively through Prisma (see
  [prisma.md](prisma.md)) — no raw SQL, no separate `pg` client code in the
  application itself (a driver adapter package is used internally by
  Prisma; the app never imports `pg` directly).
- The healthcheck in `docker-compose.yml` (`pg_isready`) means
  `docker compose ps` accurately reports "healthy" once Postgres is actually
  ready to accept connections, not just once the container process started.

## Common mistakes

- Forgetting to run `npm run db:up` before `npm run dev` and getting a
  connection-refused error that looks like an application bug.
- Assuming the default port `5432` is free — always check for a collision
  with any other local Postgres instance before assuming a fixed port.

## Best practices

- Keep all connection details in environment variables (`.env`, gitignored),
  never hard-coded — see [.env.example](../../.env.example) for the
  documented, safe-to-commit template.
- Let the ORM (Prisma) own schema migrations rather than hand-writing SQL
  DDL — see [prisma.md](prisma.md).

## Express comparison

Not Fastify- or Express-specific — this is the same PostgreSQL either
framework would talk to. The difference is entirely in *how* the Node app
connects and queries, which is where Prisma (and Fastify's plugin system for
wiring it up) comes in.

## Interview questions

1. Why is a relational database a natural fit for this app's data model?
2. What does the named volume in `docker-compose.yml` protect against?
3. Why does this project use a non-default Postgres port?

## Interview answer

> This app's core entities — users, services, appointments — have real
> relationships (an appointment references exactly one user and one
> service), which is what relational databases and foreign keys are built
> to enforce. PostgreSQL runs here in Docker, on a non-default port to avoid
> local collisions, with its data in a named volume so it survives container
> restarts. The application never talks to Postgres directly — everything
> goes through Prisma, which is where the actual query and migration story
> lives (see prisma.md).
