# Middleware vs. Hooks vs. Plugins

## What is it?

Three related but distinct ways to run shared logic across routes:

- **Express middleware**: `(req, res, next)` functions run in a single,
  flat, registration-ordered chain via `app.use()`.
- **Fastify hooks**: functions attached to a named lifecycle stage (see
  [08-hooks.md](08-hooks.md)/[09-lifecycle.md](09-lifecycle.md)), scoped by
  encapsulation.
- **Fastify plugins**: the composition unit (see [10-plugins.md](10-plugins.md))
  that *contains* routes, hooks, and decorators as an encapsulated (or
  global, via `fastify-plugin`) unit.

## Why does Fastify have it?

Fastify **can** run genuine Express-style middleware via the
`@fastify/middie` plugin, for compatibility with the Express ecosystem
(e.g. `cors`, `helmet`-style packages written as `(req, res, next)`
functions). But for anything written for this project specifically, hooks
and plugins are the idiomatic choice — they're faster (no extra
compatibility shim), scoped by encapsulation, and integrate with Fastify's
schema/validation pipeline in a way generic middleware can't.

## How does it work?

| Concept | Granularity | Scope | Named lifecycle stage? |
|---|---|---|---|
| Express middleware | One flat chain | Global (or per-`Router`) | No — just registration order |
| Fastify hook | One named stage | Encapsulated (opt-out via `fastify-plugin`) | Yes — 8 explicit stages |
| Fastify plugin | A whole unit (routes + hooks + decorators) | Encapsulated (opt-out via `fastify-plugin`) | N/A — it's the container |

In short: a **plugin** is the unit you register; a **hook** is a function you
attach to a lifecycle stage, usually from inside a plugin. There's no
separate "Fastify middleware" primitive to reach for — hooks cover that role.

## Simple example

Express:

```typescript
app.use((req, res, next) => {
  console.log(req.method, req.url);
  next();
});
```

The Fastify equivalent is a hook, not "middleware":

```typescript
app.addHook('onRequest', async (request) => {
  console.log(request.method, request.url);
});
```

## Application example

This project has zero Express-style middleware, and two real hooks:

```typescript
// src/modules/appointments/appointment.routes.ts — encapsulated hook
app.addHook('preHandler', async (request) => { /* log module access */ });

// src/plugins/request-timing.ts — global hook, via fastify-plugin
app.addHook('onRequest', async (request) => { request.startTime = Date.now(); });
```

Neither needed `@fastify/middie` or any Express-shaped middleware — hooks
were sufficient for both the encapsulated and the global case.

## Important details

- `@fastify/middie` exists specifically so you can reuse an existing Express
  middleware package without rewriting it — it's an escape hatch, not the
  default way to write new logic in a Fastify app.
- Middleware run through the compatibility layer only maps to the
  `onRequest` stage — you lose access to the later, more specific stages
  (`preValidation`, `preHandler`, `onSend`, etc.) that hooks give you natively.

## Common mistakes

- Reaching for Express middleware packages by habit when a native Fastify
  hook (or an existing `@fastify/*` plugin) already solves the same problem
  more idiomatically and faster.
- Adding middleware/hooks "just to demonstrate the concept" where the app
  doesn't actually need one — this project deliberately keeps hook usage to
  cases that serve a real purpose (timing, access logging), per its own
  design goal of not over-engineering.

## Best practices

- Default to native Fastify hooks and plugins for anything written for this
  project.
- Reach for `@fastify/middie` only when there's a specific, valuable
  third-party Express middleware you'd otherwise have to reimplement.

## Express comparison

Already the subject of this whole document — see the table above.

## Interview questions

1. Can Fastify run genuine Express middleware, and how?
2. What's lost when running Express middleware through Fastify's compatibility layer?
3. Why does Fastify not need a generic "middleware" concept the way Express does?
4. When would you reach for `@fastify/middie` in a real project?

## Interview answer

> Fastify doesn't have a generic middleware primitive the way Express does —
> its named, staged hooks cover that role natively, with the advantage of an
> explicit execution point (`onRequest`, `preHandler`, `onSend`, etc.) instead
> of one flat, ordering-dependent chain. Fastify can still run real Express
> middleware via the `@fastify/middie` compatibility plugin, which is useful
> for reusing existing Express-ecosystem packages, but anything written
> specifically for a Fastify app should use hooks and plugins directly rather
> than middleware patterns ported over from Express.
