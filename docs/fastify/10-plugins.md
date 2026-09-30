# Plugins

## What is it?

Fastify's fundamental unit of composition. A plugin is just an `async`
function taking the Fastify instance (and optional options) that can
register routes, hooks, decorators, or even other plugins. It's registered
with `app.register(pluginFn, options?)`.

## Why does Fastify have it?

Everything in Fastify — routes, database connections, auth, third-party
integrations — is expressed as a plugin so that the *same* mental model and
the *same* API (`register`, `decorate`, `addHook`) applies whether you're
adding one route or wiring up a whole subsystem. This uniformity is also
what makes [encapsulation](11-encapsulation.md) possible: each `register()`
call creates a new, isolated child context by default.

## How does it work?

```typescript
async function myPlugin(app: FastifyInstance, options: MyPluginOptions) {
  app.get('/x', async () => ({ ok: true }));
}

app.register(myPlugin, { someOption: true });
```

Fastify tracks plugin registration as a **loading phase**, separate from
request handling: `app.register()` calls are queued, and Fastify resolves them
(in dependency order, respecting `await`/returned Promises inside each plugin
function) before the app becomes "ready" (`app.ready()` / before it starts
accepting requests via `listen()`). This is why an `async` setup step inside
a plugin (like connecting to a database in Phase 4) is safe — Fastify waits
for it.

### `fastify-plugin`

By default, `register()` gives a plugin its **own encapsulated child
context** — hooks/decorators added inside it don't leak to sibling plugins.
Wrapping a plugin function with `fastify-plugin` (`fp()`) opts out of that:
it tells Fastify "run this plugin's code against the *parent* scope
directly," so anything it adds (hooks, decorators) becomes visible to
everyone at that parent level and below. Use it specifically when a plugin's
whole purpose is to add something global (a decorator every route needs, a
hook every route should run) — not for plugins that are actual resource
modules.

## Simple example

```typescript
import fp from 'fastify-plugin';

async function loggerPlugin(app: FastifyInstance) {
  app.addHook('onRequest', async (request) => {
    request.log.info('incoming request');
  });
}

// Without fp(): this hook only applies to routes registered on `app` inside
// this exact plugin function (none, in this example).
app.register(loggerPlugin);

// With fp(): the hook attaches to the parent, so it runs for every route
// in the whole app.
app.register(fp(loggerPlugin));
```

## Application example

This project has two kinds of plugins, deliberately:

- **[src/modules/appointments/appointment.routes.ts](../../src/modules/appointments/appointment.routes.ts)**
  — a plain plugin (no `fp()`), because it's meant to be encapsulated: its
  `preHandler` hook should only apply to appointment routes, not the whole app.
- **[src/plugins/request-timing.ts](../../src/plugins/request-timing.ts)**
  — wrapped in `fp()`, because its whole job is to add a global hook and
  decorator that every route in the app needs.

```typescript
// src/app.ts
app.register(requestTimingPlugin); // fp-wrapped: global
app.register(appointmentRoutes);   // plain: encapsulated
```

## Important details

- `app.register()` accepts a plugin function directly, or (for
  file-per-plugin organization, common with database/Redis connections in
  Phase 4+) an object shaped like `{ default: pluginFn }`, which is what a
  `export default myPlugin` compiles to — Fastify's `register()` understands
  this automatically.
- Plugins can be `async` and `await` real setup work (e.g. connecting to
  Postgres) — the app won't start accepting requests until all registered
  plugins have resolved.
- `fastify-plugin` also lets you declare a plugin's `name` and `dependencies`,
  which Fastify uses to validate load order (not used yet in this project,
  but relevant once Phase 4/5 plugins depend on each other, e.g. auth
  depending on the database plugin being ready first).

## Common mistakes

- Wrapping *every* plugin in `fastify-plugin` "just in case" — this defeats
  encapsulation entirely and turns the whole app into one flat, global scope,
  which is exactly what Fastify's plugin system is designed to avoid.
- Registering a plugin without `await`-ing setup that must complete before
  routes are reachable, then wondering why a route occasionally runs before
  a resource (like a DB client) is ready — Fastify handles this correctly
  *if* the plugin function properly returns/awaits its setup Promise.
- Forgetting that two sibling plugins can't see each other's decorators
  unless one of them uses `fastify-plugin`.

## Best practices

- Default to plain (non-`fp`) plugins for anything resource/domain-shaped
  (users, services, appointments, auth) — encapsulation is a feature, not a
  limitation, for these.
- Reach for `fastify-plugin` only for genuinely cross-cutting infrastructure:
  database/Redis clients, global decorators, global error/logging hooks.

## Express comparison

| | Express | Fastify |
|---|---|---|
| Composition unit | Router / middleware function | Plugin (`async function(app, opts)`) |
| Registration | `app.use(router)` | `app.register(plugin, opts)` |
| Async setup before serving traffic | Manual (`await db.connect()` before `app.listen()`) | Built into the plugin loading phase |
| Scoping | Everything is effectively global once `use()`d | Encapsulated by default, opt-out via `fastify-plugin` |

## Interview questions

1. What is a Fastify plugin, structurally?
2. What does `fastify-plugin` do, and why would you use it?
3. Why can an `async` plugin safely perform setup like a database connection?
4. What's the tradeoff of wrapping every plugin in `fastify-plugin`?

## Interview answer

> A Fastify plugin is just an `async` function that receives the Fastify
> instance (and options) and can add routes, hooks, or decorators to it.
> `app.register()` is how it's attached, and by default each registered
> plugin gets its own encapsulated child scope — a deliberate design choice
> so hooks/decorators don't leak across unrelated parts of the app.
> `fastify-plugin` opts a specific plugin out of that isolation, attaching
> its contents to the parent scope instead, which is the right tool for
> genuinely global concerns like a database connection or a logging hook,
> but the wrong tool for ordinary resource modules that should stay scoped.
