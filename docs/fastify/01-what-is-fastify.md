# What is Fastify?

## What is it?

Fastify is a Node.js web framework, similar in purpose to Express: it lets you
define HTTP routes, handle requests, and send responses. It was built from
scratch (first released 2016) with three explicit goals: **speed**, **schema-based
validation/serialization**, and a **plugin architecture with proper encapsulation**.

## Why does Fastify have it?

Express was designed in 2010 for a much simpler Node.js (no native promises,
no async/await). As Node applications grew — JSON APIs, microservices, heavy
JSON payloads — Express's design (middleware chains with `(req, res, next)`,
no built-in validation, no encapsulation) became a bottleneck both for
performance and for maintainability. Fastify was built to fix those specific
pain points rather than to be "Express but different."

## How does it work?

At a high level, Fastify:

- Uses a **radix tree router** (`find-my-way`) for fast route matching.
- Compiles your JSON Schemas into fast validation/serialization functions
  ahead of time (using `ajv` for validation and a fast-json-stringify-based
  serializer for output), instead of walking the schema on every request.
- Structures everything — routes, hooks, decorators — as **plugins**, each
  with its own encapsulated context, registered via `fastify.register()`.
- Is `async`/`await`-first: handlers are `async` functions that `return`
  or `reply.send()` a value, rather than being handed a bare `res` object.

## Simple example

```typescript
import Fastify from 'fastify';

const app = Fastify({ logger: true });

app.get('/ping', async () => {
  return { pong: true };
});

await app.listen({ port: 3000 });
```

## Application example

This project's [src/app.ts](../../src/app.ts) is the Fastify instance for the
Appointment Management API. Every other doc in this folder explains one part
of that file (and the modules it registers) in depth.

## Important details

- Fastify is **not** a fork of Express and shares no code with it, though it
  supports many of the same concepts (routing, middleware-like hooks).
- Fastify is unopinionated about database, ORM, or frontend — this project
  chooses PostgreSQL + Prisma, Redis, and BullMQ, but none of that is required
  by Fastify itself.
- Current stable major version at the time of writing is **Fastify v5**,
  which requires Node.js 20+.

## Common mistakes

- Assuming Fastify is a drop-in replacement for Express — the middleware
  signature, plugin system, and validation approach are all different.
- Not using schemas at all — this throws away Fastify's main performance and
  safety advantage over other frameworks (see [13-json-schema.md](13-json-schema.md)).

## Best practices

- Let Fastify's built-in features (validation, serialization, logging) do
  the work instead of pulling in Express-ecosystem middleware out of habit.
- Structure the app as plugins from day one (see [10-plugins.md](10-plugins.md))
  even in a small project — retrofitting encapsulation later is painful.

## Express comparison

| | Express | Fastify |
|---|---|---|
| Handler signature | `(req, res, next)` | `async (request, reply) => {}` |
| Validation | Manual / middleware (e.g. `express-validator`) | Built-in, JSON-Schema-based |
| Routing | Linear middleware stack | Radix tree router |
| Extensibility | Middleware functions | Encapsulated plugins |
| TypeScript | Community `@types/express`, loosely typed `req`/`res` | First-class, schema-inferred types |

## Interview questions

1. What is Fastify and why was it created?
2. What are Fastify's three core design goals?
3. How does Fastify achieve better throughput than Express in benchmarks?
4. Is Fastify built on top of Express?

## Interview answer

> Fastify is a Node.js web framework focused on speed, low overhead, and
> schema-driven validation/serialization. Unlike Express, it was designed
> around async/await, a radix-tree router, and a strictly encapsulated plugin
> system, so route matching and JSON validation/serialization can be
> precompiled ahead of time instead of interpreted per request. It's not a
> fork or wrapper of Express — it's a separate implementation that solves the
> same problem (HTTP routing) with different, more modern tradeoffs.
