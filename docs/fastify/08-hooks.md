# Hooks

## What is it?

A function registered with `app.addHook(stageName, fn)` that runs at a named
point in the request lifecycle (see [09-lifecycle.md](09-lifecycle.md)) —
`onRequest`, `preParsing`, `preValidation`, `preHandler`, `preSerialization`,
`onSend`, `onResponse`, `onError` — for every route within the scope it was
registered in.

## Why does Fastify have it?

Hooks are Fastify's answer to "run some shared logic around many routes"
without the ordering ambiguity of Express middleware chains. Because each
hook has a name tied to an exact lifecycle stage, there's no question about
whether it runs before or after validation, or before or after the handler —
the stage name says so.

## How does it work?

```typescript
app.addHook('onRequest', async (request, reply) => {
  // runs first, body not parsed yet
});

app.addHook('preHandler', async (request, reply) => {
  // runs after validation, right before the handler
});

app.addHook('onSend', async (request, reply, payload) => {
  // last chance to change headers; must return the payload
  return payload;
});

app.addHook('onError', async (request, reply, error) => {
  // runs when something throws during the lifecycle
});
```

Hooks registered on `app` inside a plugin only apply to routes registered in
that same plugin (and any of its children) — see
[11-encapsulation.md](11-encapsulation.md).

### The hooks used in this project

| Hook | What it is | Why it exists | Used for |
|---|---|---|---|
| `onRequest` | Fires first, before parsing | Earliest point to start per-request work | Starting the response timer |
| `preHandler` | Fires after validation, before the handler | Guard/authorize a known-valid request | Logging module access; per-route body checks |
| `onSend` | Fires after the handler, before the response is flushed | Last point headers/payload can change | Setting the `x-response-time-ms` header |
| `onResponse` | Fires after the response is fully sent | Metrics/logging that can't affect the response | Logging total request time |

`preParsing`, `preValidation`, and `preSerialization` aren't used in this
project's application code yet (there's no schema to validate against
before Phase 3, and no custom serialization need), but are explained here
since they're common interview topics — see the standalone
[docs/examples/hooks-example.ts](../examples/hooks-example.ts) for all of
them demonstrated in isolation.

## Simple example

```typescript
app.addHook('onRequest', async (request) => {
  console.log(`${request.method} ${request.url}`);
});
```

## Application example

Two real hooks from this project, at different scopes:

```typescript
// src/modules/appointments/appointment.routes.ts
// Plugin-scoped preHandler — runs for every route in this file
app.addHook('preHandler', async (request) => {
  request.log.info({ url: request.url }, 'accessing appointments module');
});
```

```typescript
// src/plugins/request-timing.ts
// Global hooks (via fastify-plugin) — run for every route in the whole app
app.addHook('onRequest', async (request) => { request.startTime = Date.now(); });
app.addHook('onSend', async (request, reply, payload) => {
  reply.header('x-response-time-ms', (Date.now() - request.startTime).toString());
  return payload;
});
```

## Important details

- A hook can stop the lifecycle early by sending a reply — exactly how the
  route-level `preHandler` in [07-route-options.md](07-route-options.md)
  returns `400` before the handler runs.
- `onSend` hooks receive the `payload` as their third argument and **must
  return it** (or a replacement) — it's the one hook that transforms data,
  not just observes it.
- Hooks run in registration order within the same stage and scope.

## Common mistakes

- Forgetting to `return payload` from an `onSend` hook, which silently
  breaks every response passing through it.
- Adding a hook meant for "every route in the app" inside a specific
  resource's plugin file (like `appointmentRoutes`) without `fastify-plugin`
  — it will only apply to that plugin's own routes, not siblings. This is
  the exact reason [request-timing.ts](../../src/plugins/request-timing.ts)
  is wrapped in `fp()`.
- Doing expensive work in `onRequest` for routes that don't need it, instead
  of scoping the hook to only the plugin/routes that do.

## Best practices

- Choose the narrowest stage and scope that satisfies the requirement:
  plugin-local hook over global, `preHandler` over `onRequest` unless you
  specifically need to run before parsing.
- Keep hook bodies small and focused — one concern per hook, composed via
  multiple `addHook` calls rather than one hook doing several unrelated things.

## Express comparison

| | Express middleware | Fastify hooks |
|---|---|---|
| Ordering | Registration order, chained via `next()` | Named stage + registration order within that stage |
| Scope | Global, or per-router | Global (via `fastify-plugin`) or encapsulated per-plugin |
| Stages | One generic stage | 8 named stages, each with a specific contract |
| Modifying the response body | Ad hoc, anywhere | Specifically `onSend`/`preSerialization` |

## Interview questions

1. What hooks are available in Fastify, and what stage does each run at?
2. How do you stop the lifecycle from within a hook?
3. Why must an `onSend` hook return the payload?
4. What's the difference in scope between a hook added inside a plugin vs.
   one wrapped with `fastify-plugin`?

## Interview answer

> Hooks are functions attached to a named lifecycle stage via
> `app.addHook(stage, fn)` — `onRequest`, `preValidation`, `preHandler`,
> `onSend`, `onResponse`, `onError`, and a couple of parsing-related stages.
> Unlike Express middleware, each hook's execution point relative to
> validation and the handler is fixed and named, removing ordering ambiguity.
> Hooks are also encapsulated by default — one registered inside a plugin
> only applies to that plugin's own routes — unless the plugin is wrapped
> with `fastify-plugin`, which attaches it to the parent scope instead.
