# Logging

## What is it?

Fastify's built-in logger, powered by [Pino](https://getpino.io/) — enabled
with `Fastify({ logger: true })` (see
[03-fastify-instance.md](03-fastify-instance.md)). Every request gets an
automatic "incoming request" / "request completed" pair of structured log
lines, and `request.log` gives every hook and handler a logger already bound
to that specific request.

## Why does Fastify have it?

Debugging a production API means correlating "what happened for this one
request" across possibly many log lines, possibly interleaved with hundreds
of other concurrent requests' log lines. Pino's structured (JSON) logging,
plus Fastify's automatic per-request child logger, makes that correlation
possible via a shared `reqId` field — instead of unstructured `console.log`
text that's nearly impossible to filter or query at scale.

## How it works

```typescript
request.log.info('plain message');
request.log.info({ extra: 'field' }, 'message with structured data');
request.log.warn('something worth noticing, not an error');
request.log.error(error, 'something failed');
```

`request.log` is a **child logger** — every line it writes automatically
includes that request's `reqId`, without your code passing it around
manually. Fastify's own automatic log lines already include:

```json
{"reqId":"req-2","req":{"method":"GET","url":"/appointments", ...},"msg":"incoming request"}
{"reqId":"req-2","res":{"statusCode":200},"responseTime":1.03,"msg":"request completed"}
```

`method`, `url`, `statusCode`, and `responseTime` (`requestId` is `reqId`)
are all there by default — no configuration needed for the fields section 21
asks about.

## Application example

This project's own log lines, captured from a real run, show `reqId`
threading through every custom log call for one request:

```json
{"reqId":"req-4","url":"/appointments/stats/summary","msg":"accessing appointments module"}
{"reqId":"req-4","msg":"accessing appointment stats (child scope)"}
{"reqId":"req-4","url":"/appointments/stats/summary","statusCode":200,"responseTime":0.96,"msg":"custom onResponse hook fired"}
{"reqId":"req-4","res":{"statusCode":200},"responseTime":0.96,"msg":"request completed"}
```

Four log lines, from three different places
([appointment.routes.ts](../../src/modules/appointments/appointment.routes.ts)'s
two `preHandler` hooks, [request-timing.ts](../../src/plugins/request-timing.ts)'s
`onResponse` hook, and Fastify's own automatic logging) — all trivially
correlated by `reqId: "req-4"`.

[database.ts](../../src/plugins/database.ts) also logs outside any request
context, at boot/shutdown:

```json
{"msg":"Prisma connected"}
{"msg":"Prisma disconnected"}
```

These have no `reqId` (there's no request yet) — using `app.log`, not
`request.log`, is exactly how you signal "this is app-lifecycle logging, not
request logging."

## Important details

- **`app.log` vs. `request.log`**: `app.log` is the root logger (no request
  context — use it in plugins, at boot, in `onClose`); `request.log` is a
  child logger scoped to one request (use it anywhere inside the request
  lifecycle). Using the wrong one doesn't error, but loses correlation.
- **Log levels aren't free-form** — Pino's levels (`trace`, `debug`, `info`,
  `warn`, `error`, `fatal`) each map to a numeric severity, letting you
  filter ("only show me warn and above") without touching application code.
- **`logger: true` is a default config**, not the only option — passing a
  full object (`logger: { level: 'debug', ... }`) controls verbosity and
  formatting; not something this simple project needs to customize yet.

## What should and shouldn't be logged

- **Do log**: request metadata (method, url, status, timing — all
  automatic), business-relevant events (`accessing appointments module`),
  error objects passed to `.error()` (Pino serializes the stack trace
  properly when you pass the `Error` object itself, not just its `.message`).
- **Don't log**: request bodies containing passwords or tokens (relevant
  once JWT auth is added in Phase 5 — a login body must never be logged
  wholesale), full user PII in routine info-level logs, or raw database
  connection strings/credentials.
- This project's [error-handler.ts](../../src/plugins/error-handler.ts)
  follows this split already: `request.log.error(error)` logs the *full*
  error server-side (stack trace and all) for the unexpected-error branch,
  while the client only ever receives a generic
  `{ code: 'INTERNAL_SERVER_ERROR', message: 'Something went wrong' }` — see
  [16-error-handling.md](16-error-handling.md).

## Common mistakes

- Using `console.log` instead of `request.log`/`app.log` — loses structured
  fields, `reqId` correlation, and level-based filtering entirely.
- Logging an error's `.message` string instead of the error object itself
  (`request.log.error(error)`, not `request.log.error(error.message)`) —
  Pino needs the real object to serialize the stack trace.
- Setting `logger: false` in production to "reduce noise" instead of
  adjusting the log *level* — you lose the ability to debug anything after
  the fact, versus just filtering by severity.

## Best practices

- Always prefer `request.log` inside request-scoped code, so log lines
  automatically correlate via `reqId`.
- Pass structured data as the first argument (`log.info({ orderId }, 'created')`),
  not string-interpolated into the message — it stays queryable as real JSON
  fields instead of buried in free text.

## Express comparison

Express has no built-in logger at all — a typical Express app reaches for
`morgan` (access logging, unstructured by default) plus something like
`winston` or `pino` wired in separately for application logging, with no
automatic per-request correlation unless manually implemented via
middleware (e.g., generating and threading a request ID yourself). Fastify
gives you structured logging, per-request child loggers, and `reqId`
correlation as defaults, with zero extra packages.

## Interview questions

1. What's the difference between `app.log` and `request.log`, and when
   would you use each?
2. How does Fastify correlate multiple log lines to the same request?
3. Why pass an `Error` object to `.error()` instead of just its `.message`?
4. What's a concrete example of something that should never be logged?

## Interview answer

> Fastify's logger is Pino, structured (JSON) by default, with automatic
> "incoming request"/"request completed" lines carrying method, url, status
> code, and response time. `request.log` is a child logger automatically
> bound to that request's `reqId`, so any custom log line written from a
> hook or handler correlates with Fastify's own lines and with every other
> custom line for that same request — verified in this project across
> hooks in two different plugin files plus Fastify's own automatic logging,
> all sharing one `reqId`. `app.log` is the equivalent for logging outside
> any request context, like a database connecting at boot. The discipline
> that matters most in practice: log full error objects (for the stack
> trace) server-side, but never request bodies containing credentials, and
> never leak that same detail back to the client.
