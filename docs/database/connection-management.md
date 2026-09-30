# Prisma Client Lifecycle & Connection Management

## What is it?

How a single `PrismaClient` instance is created once, connected once, shared
across the whole app, and disconnected cleanly on shutdown — instead of
being created ad hoc wherever a route needs the database.

## Why does this matter?

`PrismaClient` manages a connection pool internally. Creating more than one
instance means more than one pool competing for the database's limited
connection slots, for no benefit — and forgetting to disconnect leaves
sockets open after the process should have shut down. A single, deliberately
managed instance avoids both problems.

## How it works in this project

[src/plugins/database.ts](../../src/plugins/database.ts) is a
`fastify-plugin`-wrapped plugin — global on purpose, exactly like
[error-handler.ts](../../src/plugins/error-handler.ts) (see
[10-plugins.md](../fastify/10-plugins.md)):

```typescript
async function databasePlugin(app: FastifyInstance) {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  await prisma.$connect();
  app.decorate('prisma', prisma);

  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });
}

export default fp(databasePlugin, { name: 'database' });
```

- **Created once**: this plugin function runs exactly once, during the app's
  plugin-loading phase (see [10-plugins.md](../fastify/10-plugins.md)) —
  every route reaches the same client via `app.prisma`.
- **Connected explicitly**: `await prisma.$connect()` up front means a
  connection problem surfaces at boot, not on the first request.
- **Disconnected on shutdown**: `onClose` is a real Fastify hook, run when
  `app.close()` is called — see
  [25-graceful-shutdown.md](../fastify/25-graceful-shutdown.md) (Phase 8),
  which will call `app.close()` from a `SIGTERM`/`SIGINT` handler.

## Simple example

```typescript
// DON'T do this in a route file:
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient(); // a brand new pool, disconnected from the app's lifecycle

// DO this instead — reach for the shared instance:
app.get('/x', async (request) => {
  return request.server.prisma.user.findMany();
});
```

## Important details

- `app.prisma` is available in every route because `databasePlugin` is
  registered with `fastify-plugin` — without that, the decorator would only
  be visible inside `database.ts`'s own encapsulated scope (see
  [11-encapsulation.md](../fastify/11-encapsulation.md)).
- **The globalThis singleton trick** (`globalThis.prisma ??= new PrismaClient()`)
  shows up in a lot of Prisma+Next.js tutorials. It solves a *different*
  problem: Next.js's dev server hot-reloads modules in place, re-running
  top-level code (including `new PrismaClient()`) on every edit without
  restarting the process, silently accumulating connections. This project's
  dev server (`tsx watch`) instead fully restarts the process on every file
  change, so that specific failure mode doesn't apply here — but it's worth
  recognizing *why* that pattern exists before copying it into a project
  where it isn't needed.
- Fastify guarantees plugins load (and their `onClose` hooks fire) in a
  well-defined order tied to registration — see
  [09-lifecycle.md](../fastify/09-lifecycle.md) — so `onClose` hooks
  registered by later plugins run before earlier ones' during shutdown.

## Common mistakes

- Instantiating `new PrismaClient()` inside a route handler or a module-level
  `const` in a routes file — it works, but creates a client Fastify's
  lifecycle knows nothing about (no connect-before-serving guarantee, no
  managed disconnect).
- Forgetting `await prisma.$connect()` and relying on Prisma's lazy
  auto-connect-on-first-query instead — it works, but then a database outage
  surfaces as a failure on some arbitrary first request instead of at boot.
- Never calling `$disconnect()` — harmless in a short-lived script, but leaves
  a long-running server holding connections after a graceful shutdown should
  have released them.

## Best practices

- One `PrismaClient`, created in one plugin, decorated once, shared via
  `app.prisma` everywhere.
- Connect eagerly at boot (fail fast) and disconnect in `onClose` (clean
  shutdown) — both are a few lines, and both are already wired up here.

## Express comparison

Express has no plugin/lifecycle system to hook into at all — a comparable
Express app typically creates the client in a standalone `db.ts` module,
exported and imported wherever needed, with manual (or entirely absent)
shutdown handling. Fastify's `onClose` hook gives a first-class,
framework-recognized place to put the disconnect logic instead of leaving it
to an `process.on('SIGTERM', ...)` handler to remember unassisted.

## Interview questions

1. Why is a single shared `PrismaClient` instance preferred over creating
   one per request or per module?
2. What problem does the `globalThis.prisma` singleton pattern solve, and
   why doesn't this project need it?
3. Where does this project's Prisma client get disconnected, and what
   triggers that?
4. What's the benefit of calling `$connect()` explicitly at boot instead of
   relying on lazy auto-connect?

## Interview answer

> This project creates exactly one `PrismaClient`, backed by one connection
> pool, inside a `fastify-plugin`-wrapped plugin registered once at boot —
> every route reaches it through `app.prisma` rather than importing a client
> of its own. It connects eagerly with `$connect()` so a database outage
> fails fast at startup, and disconnects in Fastify's `onClose` hook, which
> fires when `app.close()` runs — giving the app a clean, framework-managed
> shutdown path instead of relying on a hand-rolled process signal handler.
