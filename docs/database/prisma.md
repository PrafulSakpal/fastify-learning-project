# Prisma

## What is it?

The ORM (object-relational mapper) this project uses to talk to PostgreSQL:
a schema file ([prisma/schema.prisma](../../prisma/schema.prisma)) that
describes the data model, a CLI that turns schema changes into SQL
migrations, and a generated, fully-typed client (`PrismaClient`) the
application actually calls.

## Why does this project use it?

Hand-written SQL (or a raw `pg` client) gives no compile-time safety — a
typo in a column name, or a query that returns a different shape than
expected, only fails at runtime. Prisma generates a client from the schema,
so `app.prisma.user.create({ data: { name, email } })` is fully typed against
the real `User` model, and a schema change is immediately reflected in every
call site's types after regenerating.

## How it works

### The schema

```prisma
// prisma/schema.prisma
model User {
  id        String   @id @default(uuid())
  name      String
  email     String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  appointments Appointment[]
}
```

`npx prisma migrate dev --name <description>` diffs this against the
database's actual state, generates a SQL migration file under
`prisma/migrations/`, and applies it. `migrate dev` is *documented* to also
regenerate the client, but see Common mistakes below for what was actually
observed building this project — run `npx prisma generate` explicitly
whenever in doubt, rather than assuming it happened.

### A current, real architecture detail: driver adapters (Prisma 7)

Verified directly while building this project: in Prisma 7, `datasource.url`
in `schema.prisma` is **no longer read by the CLI**, and `PrismaClient`
**requires an explicit driver adapter** instead of a bare connection string —
attempting the old pattern throws immediately:

```text
error: The datasource property `url` is no longer supported in schema files.
Move connection URLs for Migrate to `prisma.config.ts` and pass either
`adapter` for a direct database connection ... to the `PrismaClient` constructor.
```

So this project has **two** separate places a connection string is used:

```typescript
// prisma.config.ts — used only by the CLI (migrate/generate/studio)
export default defineConfig({
  datasource: { url: process.env.DATABASE_URL },
});
```

```typescript
// src/plugins/database.ts — used by the running app
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
```

If you've used an older Prisma version (or a tutorial written for one), this
is the biggest structural difference to unlearn — see
[connection-management.md](connection-management.md) for the full picture.

### CRUD

```typescript
app.prisma.user.create({ data: { name, email } });
app.prisma.user.findMany({ skip, take, orderBy: { createdAt: 'asc' } });
app.prisma.user.findUnique({ where: { id } });
app.prisma.user.update({ where: { id }, data });
app.prisma.user.delete({ where: { id } });
```

Every one of these is used in
[user.routes.ts](../../src/modules/users/user.routes.ts) /
[service.routes.ts](../../src/modules/services/service.routes.ts) /
[appointment.routes.ts](../../src/modules/appointments/appointment.routes.ts).

## Application example: a type mismatch the type provider caught

Building this project's response schemas surfaced a real, useful compile
error. `createdAt`/`updatedAt` are real JS `Date` objects on whatever Prisma
returns, and `price` on a `Service` is a `Decimal` object (arbitrary-precision
— never a plain JS `number`, to avoid floating-point rounding on money) — but
the response schema declares both as `type: 'string'` (the actual JSON wire
format). Passing the raw Prisma object straight to `reply.send()` failed to
compile:

```text
error TS2345: Argument of type '{ ...; price: Decimal; createdAt: Date; ... }'
is not assignable to parameter of type '{ ...; price: string; createdAt: string; ... }'
```

Fixed by explicitly converting before sending — see
[service.routes.ts](../../src/modules/services/service.routes.ts):

```typescript
function toServiceResponse(service: Service) {
  return {
    ...service,
    price: service.price.toString(),
    createdAt: service.createdAt.toISOString(),
    updatedAt: service.updatedAt.toISOString(),
  };
}
```

This is the type provider doing its job — it caught a real
Date/Decimal-vs-string mismatch at compile time instead of it silently
reaching `fast-json-stringify` at runtime.

## Important details

- **Prisma errors have stable, documented codes.** `P2002` (unique
  constraint violation), `P2025` (record not found for update/delete),
  `P2003` (foreign key constraint violation) are all identified via
  `error instanceof Prisma.PrismaClientKnownRequestError` and `error.code`
  in [error-handler.ts](../../src/plugins/error-handler.ts) — see
  [16-error-handling.md](../fastify/16-error-handling.md).
- **`P2002`'s `error.meta` shape depends on the connection method.** With
  the classic engine it's `{ target: string[] }` (widely documented); with a
  driver adapter (this project), it's instead nested under
  `meta.driverAdapterError.cause.constraint.index` — confirmed by actually
  triggering a duplicate-email insert against this project's database. Code
  written against only the old shape silently falls back to a useless
  generic message; see `extractConstraintName()` in `error-handler.ts` for
  the fix that reads both shapes.
- A known, dev-only security advisory: `prisma`'s CLI transitively depends
  on `mysql2` (used for its own multi-database tooling) and `deepmerge-ts`,
  both currently flagged high-severity by `npm audit`. This project never
  calls into that code path (Postgres-only, and `prisma` is a
  `devDependency`, never shipped to production), but it's worth knowing
  `npm audit` isn't wrong here — just scoped to unused tooling.

## Common mistakes

- Importing `PrismaClient` and calling `new PrismaClient()` in more than one
  place — see [connection-management.md](connection-management.md) for why
  this project decorates a single instance onto `app.prisma` instead.
- Forgetting to re-run `npx prisma generate` after editing `schema.prisma` —
  the generated client (and its types) won't reflect the new schema until
  it's regenerated. **Verified directly in this project**: adding a
  `password` field to `User` and running `prisma migrate dev --name ...`
  applied the migration to the database correctly, but the generated
  client's types still didn't include `password` — TypeScript failed to
  compile `user.password` with the field missing from the inferred type,
  until an explicit `npx prisma generate` was run afterward. Don't assume
  `migrate dev` regenerated the client — verify, or just always run
  `generate` explicitly after any schema change.
- Trusting old tutorials' `datasource { url = env("DATABASE_URL") }` pattern
  without checking the installed Prisma major version — it silently doesn't
  work as of Prisma 7.

## Best practices

- Keep the schema as the single source of truth for the data model; let
  Prisma generate both the migration SQL and the TypeScript types from it.
- Prefer Prisma's own documented error codes (`P2002`, `P2025`, `P2003`, ...)
  over trying to parse database-specific error messages/strings, which are
  driver- and database-version-dependent.

## Express comparison

Express has no default ORM story at all — a typical Express + PostgreSQL
project reaches for Prisma, TypeORM, Sequelize, or a raw `pg` client, chosen
independently of the framework. Nothing here is Fastify-specific; this
project's Prisma usage would look almost identical wired into an Express app
— the only Fastify-specific part is *how* the client is shared app-wide (a
decorator, see [connection-management.md](connection-management.md)).

## Interview questions

1. What changed about how `PrismaClient` connects to a database in Prisma 7?
2. Why declare a response schema's date fields as `string` when Prisma
   returns real `Date` objects — and what catches the mismatch?
3. What do Prisma error codes `P2002`, `P2025`, and `P2003` each mean?
4. Why might `error.meta` look different for the same `P2002` error across
   two different Prisma projects?

## Interview answer

> Prisma generates a fully-typed client from a declarative schema file, and
> a CLI that turns schema changes into versioned SQL migrations. As of
> Prisma 7, connecting requires an explicit driver adapter passed to
> `PrismaClient` (e.g. `@prisma/adapter-pg` for Postgres) rather than a bare
> connection string on the schema's datasource block — the CLI and the
> running app now get their connection string through two separate paths.
> Prisma's "known" errors carry stable codes like `P2002` (unique violation),
> `P2025` (record not found), and `P2003` (foreign key violation), which a
> global error handler can map to clean HTTP responses — though the exact
> shape of `error.meta` for those errors can differ depending on whether
> Prisma is using its classic engine or a driver adapter, which is worth
> verifying directly rather than assuming from documentation examples.
