# Routes

## What is it?

A route is a mapping of `(HTTP method, URL pattern) → handler`. Fastify
exposes shorthand methods (`app.get`, `app.post`, `app.put`, `app.patch`,
`app.delete`) and a lower-level `app.route()` for when you want the full
configuration object in one place.

## Why does Fastify have it?

Routing is the core job of any web framework. Fastify's specific approach —
a radix-tree router, and routes-as-config-objects (method, url, schema, hooks,
handler all together) — is what enables per-route schema validation and
per-route hooks without middleware chains.

## How does it work?

Shorthand form:

```typescript
app.get('/appointments/:id', async (request, reply) => {
  // handler
});
```

is sugar for the full form:

```typescript
app.route({
  method: 'GET',
  url: '/appointments/:id',
  handler: async (request, reply) => {
    // handler
  },
});
```

`app.route()` is preferred when a route needs several options at once
(schema, hooks, config) and you want them visually grouped — see
[07-route-options.md](07-route-options.md) for the full option object, which
this project starts using once JSON Schema is introduced in Phase 3.

## Simple example

```typescript
// Shorthand
app.get('/ping', async () => ({ pong: true }));

// Equivalent, using app.route()
app.route({
  method: 'GET',
  url: '/ping',
  handler: async () => ({ pong: true }),
});
```

## Application example

[src/modules/appointments/appointment.routes.ts](../../src/modules/appointments/appointment.routes.ts)
uses the shorthand form for all three Phase 1 routes:

```typescript
app.get('/appointments', async (request, reply) => { /* ... */ });
app.get('/appointments/:id', async (request, reply) => { /* ... */ });
app.post('/appointments', async (request, reply) => { /* ... */ });
```

These are registered onto the main app via `app.register(appointmentRoutes)`
in [src/app.ts](../../src/app.ts) — `register` is how a group of routes
(a "plugin") is attached; see [10-plugins.md](10-plugins.md).

## Important details

- Route URLs support params (`:id`), and Fastify's router (not a hand-rolled
  regex) resolves them — including correctly prioritizing static segments
  over parametric ones (e.g. `/appointments/mine` vs `/appointments/:id`).
- Every route in this project so far is `async` and returns its response
  value directly, rather than always calling `reply.send()` explicitly (both
  work — see [06-reply.md](06-reply.md) for when to use which).
- Route methods are case-insensitive at the HTTP level but Fastify's API
  uses lowercase method names (`app.get`, not `app.GET`).

## Common mistakes

- Defining the same `(method, url)` pair twice — Fastify throws at startup
  (`FST_ERR_DUPLICATED_ROUTE`) rather than silently using the last one, unlike
  some Express-style routers.
- Forgetting that route params are always strings — `request.params.id` is
  `string`, not `number`, until you validate/coerce it (see [14-validation.md](14-validation.md)).
- Putting business logic directly in the route handler for anything beyond
  trivial cases — fine for Phase 1's in-memory example, but as real
  persistence is added (Phase 4), logic should move to a small service
  function so the handler stays about HTTP concerns only.

## Best practices

- Group related routes into one plugin function per resource (as
  `appointmentRoutes` does), not one file with every route in the app.
- Use `app.route()` once a route needs more than a handler (schema, hooks) —
  it keeps everything about that route in one object instead of scattered
  arguments.

## Express comparison

| | Express | Fastify |
|---|---|---|
| Define a route | `app.get('/x', (req, res) => {...})` | `app.get('/x', async (request, reply) => {...})` |
| Group routes | `express.Router()` | Plugin function + `app.register()` |
| Route conflicts | Last one registered silently wins | Throws at startup |
| Full config in one place | Not built-in | `app.route({ method, url, schema, handler, ... })` |

## Interview questions

1. What's the difference between the shorthand route methods and `app.route()`?
2. How does Fastify handle two routes registered for the same method + URL?
3. Why might you prefer `app.route()` over `app.get()` for a specific endpoint?
4. How are route params typed, and what has to happen before you can trust
   their type?

## Interview answer

> Fastify routes map an HTTP method and URL to a handler, either via
> shorthand methods like `app.get()` or the full `app.route({...})` config
> object — the shorthand is sugar over the same underlying route
> registration. Routes are grouped into plugin functions per resource and
> attached with `app.register()`, which is also the unit of encapsulation.
> Route params always arrive as strings and aren't validated by default —
> that's handled separately via JSON Schema, which is also why `app.route()`
> becomes more useful than the shorthand once a route needs schema/hooks
> alongside its handler.
