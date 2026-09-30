# The Fastify Request Lifecycle

## What is it?

The fixed sequence of stages every request passes through, from the moment
it hits the server to the moment the response is fully sent. Hooks (see
[08-hooks.md](08-hooks.md)) are simply named attachment points along this
sequence.

## Why does Fastify have it?

A framework needs a predictable place to "hook into" a request for concerns
that aren't the route handler itself: auth checks, logging, timing,
validation, response shaping. Fastify names each of these points explicitly
and documents their exact order, instead of relying on middleware ordering
(where two functions racing to modify the same response is a common Express
bug class).

## How does it work?

```text
Incoming Request
      ↓
  onRequest        ← earliest hook; body not yet parsed
      ↓
  preParsing       ← can transform the raw request stream before parsing
      ↓
  (body parsing happens here)
      ↓
  preValidation    ← after parsing, before schema validation
      ↓
  Validation       ← Fastify itself validates params/query/body/headers against schema
      ↓
  preHandler       ← after validation, right before your route logic
      ↓
  Handler          ← your route function — the actual business logic
      ↓
  preSerialization ← after the handler returns, before the response schema serializes it
      ↓
  onSend           ← last chance to modify headers/payload before it's written to the socket
      ↓
  Response sent over the wire
      ↓
  onResponse       ← after the response has been fully sent (logging/metrics only)

  onError          ← runs instead of/alongside the above if anything throws
```

Each named stage can have **zero, one, or many** hook functions attached
(via `app.addHook(stageName, fn)`), and they run in registration order
within a stage.

## Simple example

Given:

```typescript
app.addHook('onRequest', async () => console.log('1. onRequest'));
app.addHook('preHandler', async () => console.log('2. preHandler'));
app.get('/x', async () => {
  console.log('3. handler');
  return { ok: true };
});
app.addHook('onSend', async (_, __, payload) => {
  console.log('4. onSend');
  return payload;
});
app.addHook('onResponse', async () => console.log('5. onResponse'));
```

A request to `GET /x` logs, in order: `1. onRequest`, `2. preHandler`,
`3. handler`, `4. onSend`, `5. onResponse` — always in this order, regardless
of where in the file each hook happens to be defined.

## Application example

[src/plugins/request-timing.ts](../../src/plugins/request-timing.ts) uses
three different stages deliberately, based on what each one can and can't do:

- **`onRequest`** — records `request.startTime = Date.now()`. Chosen because
  it's the earliest point, so the timer starts before any parsing/validation
  overhead.
- **`onSend`** — computes the elapsed time and calls `reply.header(...)`.
  Chosen because this is the *last* stage where headers can still be
  changed — `onResponse` is too late.
- **`onResponse`** — only logs. Chosen because by this stage the response has
  already gone out; this stage exists specifically for metrics/cleanup work
  that doesn't need to touch the response itself.

Real observed log order for one request (from this project's dev server):

```text
"accessing appointments module"   ← preHandler (plugin hook, see 08-hooks.md)
"custom onResponse hook fired"    ← onResponse
```

(The `x-response-time-ms` header set in `onSend` is visible in the raw HTTP
response, not the logs, since `onSend` doesn't log by default in this project.)

## Important details

- **`preValidation` vs. `preHandler`** is one of the most commonly confused
  pairs: `preValidation` runs *before* Fastify validates the request against
  its JSON Schema, so it's the place to mutate `request.body`/`query` if a
  schema depends on it. `preHandler` runs *after* validation has already
  passed, so at that point the request is known-valid — use it for
  authorization/business checks that don't need to alter the data.
- Returning a value or calling `reply.send()` in any hook before `Handler`
  stops the lifecycle there — later hooks and the handler itself are skipped
  (this is exactly how the `preHandler`-based validation in
  [07-route-options.md](07-route-options.md) short-circuits to a `400`).
- `onError` doesn't fit neatly "after" a single stage — it fires whenever an
  error is thrown from `preValidation` through the `handler`.

## Common mistakes

- Assuming `preHandler` runs before validation — it doesn't; use
  `preValidation` for that.
- Trying to modify response headers in `onResponse` — too late; the response
  has already been sent to the client. Use `onSend` instead.
- Not returning the (possibly modified) `payload` from an `onSend` hook —
  `onSend` hooks must return the payload, or the response body is lost.

## Best practices

- Pick the earliest stage that can do what you need (e.g. `onRequest` for
  request-scoped setup like timers), and the latest stage that still lets you
  do it (e.g. `onSend`, not `onResponse`, for header changes).
- Keep the lifecycle diagram in mind when debugging "why didn't my hook run"
  or "why did my handler run twice" — the order is fixed and documented, so
  the bug is almost always a stage mismatch.

## Express comparison

Express has no named lifecycle — just a single middleware chain executed in
registration order, with `next()` moving to the next function and no
distinction between "before validation" and "before the handler." Fastify's
explicit, named stages replace that single chain with several dedicated
extension points, each with a specific contract (e.g. `onSend` must return
the payload; `onRequest` cannot see `request.body` yet).

## Interview questions

1. Draw or describe the Fastify request lifecycle from request to response.
2. What is the difference between `preValidation` and `preHandler`?
3. Why can you set response headers in `onSend` but not in `onResponse`?
4. What happens to the rest of the lifecycle if a `preHandler` sends a response?

## Interview answer

> Fastify defines a fixed, named sequence of stages a request passes
> through: `onRequest` → `preParsing` → (body parsing) → `preValidation` →
> schema validation → `preHandler` → the route `handler` → `preSerialization`
> → `onSend` → the response is sent → `onResponse`, with `onError` firing on
> any thrown error. Each stage has a specific contract — for example,
> `onRequest` runs before the body is parsed, `preValidation` is the last
> point to mutate input before schema validation runs, and `onSend` is the
> last point to modify headers before the response is flushed. Returning a
> value or sending a reply from any hook before the handler stops the
> lifecycle there, skipping the handler and later hooks.
