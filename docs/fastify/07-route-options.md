# Route Options

## What is it?

The full configuration object accepted by `app.route({ ... })` — every
shorthand call like `app.get(url, handler)` is sugar for a subset of this
same object. It's where a route's URL, method, handler, schema, and
route-specific hooks all live together.

## Why does Fastify have it?

A route often needs more than "URL + handler": input validation, a guard
that must run before the handler, response shaping, and so on. Rather than
bolting these on with a chain of middleware functions (Express's approach),
Fastify lets you declare all of it as one object per route, so everything
about a route is visible in one place and Fastify can optimize each route
independently (e.g. compiling its schema once at startup).

## How does it work?

```typescript
app.route({
  method: 'POST',       // HTTP method (or an array of methods)
  url: '/appointments',  // the route pattern
  schema: { ... },        // JSON Schema for params/query/body/response (Phase 3)
  preHandler: async (request, reply) => { ... }, // runs before the handler, route-scoped
  handler: async (request, reply) => { ... },     // the actual route logic
  config: { ... },        // arbitrary metadata, readable in hooks via request.routeOptions.config
});
```

Most of these options also accept an **array** of functions (e.g.
`preHandler: [fn1, fn2]`) when more than one needs to run in order.

`preHandler` here is the same hook type used with `app.addHook('preHandler', ...)`
(see [08-hooks.md](08-hooks.md)) — the difference is scope: a hook added via
`app.addHook()` runs for every route in that plugin, while a `preHandler`
listed directly on one route's options runs **only for that route**.

## Simple example

```typescript
app.route({
  method: 'GET',
  url: '/secret',
  preHandler: async (request, reply) => {
    if (request.headers['x-api-key'] !== 'demo') {
      return reply.code(401).send({ message: 'Unauthorized' });
    }
  },
  handler: async () => ({ secret: 42 }),
});
```

## Application example

[src/modules/appointments/appointment.routes.ts](../../src/modules/appointments/appointment.routes.ts)
defines `POST /appointments` with `app.route()` so its `schema` and
`handler` live together in one object:

```typescript
app.route({
  method: 'POST',
  url: '/appointments',
  schema: createAppointmentSchema, // body/response schemas — see 13-json-schema.md
  handler: async (request, reply) => { /* create the appointment */ },
});
```

In Phase 2, this same route used a hand-written `preHandler` to check
`userName`/`serviceName` were present, returning `400` manually. That code
is gone now — `schema.body` (Phase 3) does the same job declaratively, runs
before `preHandler` would have anyway (see
[09-lifecycle.md](09-lifecycle.md)), and also gives `request.body` a real
inferred TypeScript type instead of a manual cast. Sending an incomplete
body still short-circuits with `400`, just via a different mechanism now:

```bash
curl -i -X POST http://localhost:3000/appointments -H "Content-Type: application/json" -d '{"userName":"Sam"}'
# HTTP/1.1 400 Bad Request
# {"success":false,"error":{"code":"VALIDATION_ERROR","message":"Request validation failed", ...}}
```

## Important details

- Returning a value (or calling `reply.send()`) from a `preHandler` stops the
  lifecycle there — the route's `handler` never runs. This is how the Phase 2
  version of the `400` response above used to work, before it moved to
  `schema.body` validation (see [14-validation.md](14-validation.md), which
  short-circuits the same way but at the `Validation` stage, not `preHandler`).
- `preHandler` on a route and `preHandler` added via `app.addHook()` at the
  plugin level both run, in order: plugin/parent hooks first, then
  route-specific ones (see [09-lifecycle.md](09-lifecycle.md)).
- `config` is a good place for route-local metadata a hook needs to read
  (e.g. `config: { rateLimit: false }`), rather than hard-coding exceptions
  by URL string comparison inside a shared hook.

## Common mistakes

- Forgetting that returning early from a `preHandler` without sending a
  response leaves the client hanging — always either `return reply.send(...)`
  / `return reply.code(x).send(...)`, or return nothing at all to let the
  request proceed.
- Duplicating the same `preHandler` logic across many `app.route()` calls
  instead of hoisting it into a plugin-level `app.addHook()` when it truly
  applies to every route in that plugin.
- Using route-level `preHandler` for validation instead of `schema.body` —
  schema-based validation is faster (compiled once at startup) and less
  error-prone than hand-written checks, and gives you inferred TypeScript
  types for free (see [13-json-schema.md](13-json-schema.md)).

## Best practices

- Use the shorthand methods (`app.get`, `app.post`, ...) for simple routes;
  switch to `app.route({...})` as soon as a route needs its own
  schema/hooks/config, so everything about it stays in one readable object.
- Prefer plugin-level hooks (`app.addHook`) for cross-cutting concerns shared
  by every route in a module, and route-level options for anything specific
  to one endpoint.

## Express comparison

| | Express | Fastify |
|---|---|---|
| Per-route guard | `app.post('/x', authMiddleware, handler)` | `app.route({ preHandler: authMiddleware, handler })` |
| Where is validation declared | Middleware, separate from the route | `schema` field on the same route object |
| Metadata per route | Not standard | `config` field, readable in hooks |

## Interview questions

1. What is the relationship between `app.get(url, handler)` and `app.route({...})`?
2. What happens if a route's `preHandler` sends a response — does the `handler` still run?
3. What's the difference in scope between a route-level `preHandler` and a
   plugin-level hook added with `app.addHook()`?
4. What is the `config` route option used for?

## Interview answer

> `app.route({...})` is the full configuration object behind every route —
> method, url, handler, schema, and route-specific hooks like `preHandler`
> all live together. The shorthand methods are just sugar over a subset of
> it. A `preHandler` declared on one route only guards that route, whereas a
> hook added via `app.addHook()` at the plugin level runs for every route in
> that plugin (and its children). If a `preHandler` sends a response, the
> lifecycle stops there and the route's own `handler` is never invoked.
