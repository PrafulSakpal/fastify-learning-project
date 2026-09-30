# Error Handling

## What is it?

Two hooks that centralize how every error and every unmatched route is
turned into a response: `fastify.setErrorHandler()` (for thrown errors) and
`fastify.setNotFoundHandler()` (for requests to routes that don't exist).

## Why does Fastify have it?

Without a central error handler, every route handler would need its own
`try/catch` and its own opinion about the JSON shape of an error response —
inconsistent across a codebase, and easy to forget in a new route. A single
handler, registered once, guarantees every error — validation failure,
expected business error, unexpected bug — comes back in the same shape.

## How does it work?

```typescript
app.setErrorHandler((error, request, reply) => {
  // inspect `error` and decide the response
});

app.setNotFoundHandler((request, reply) => {
  reply.code(404).send({ message: 'not found' });
});
```

`setErrorHandler` catches:
- Errors **thrown** anywhere in the lifecycle (a handler, a hook, `preHandler`, etc.)
- Fastify's own **validation errors** (identifiable by `error.validation` being present)
- Anything **you throw yourself** — a plain `Error`, or a custom error class

## Simple example

```typescript
class NotFoundError extends Error {}

app.get('/x', async () => {
  throw new NotFoundError('missing');
});

app.setErrorHandler((error, request, reply) => {
  if (error instanceof NotFoundError) {
    return reply.code(404).send({ message: error.message });
  }
  reply.code(500).send({ message: 'unexpected error' });
});
```

## Application example

This project defines one small error class,
[AppError](../../src/common/errors/app-error.ts), for "expected" business
errors:

```typescript
export class AppError extends Error {
  constructor(public readonly code: string, message: string, public readonly statusCode: number) {
    super(message);
  }
  static notFound(message: string, code = 'NOT_FOUND') { return new AppError(code, message, 404); }
}
```

and one global handler,
[src/plugins/error-handler.ts](../../src/plugins/error-handler.ts), that
turns every kind of error into the same shape:

```typescript
app.setErrorHandler((error: AppError | FastifyError, request, reply) => {
  if (error instanceof AppError) {
    return reply.code(error.statusCode).send({ success: false, error: { code: error.code, message: error.message } });
  }
  if (error.validation) {
    return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: '...', details: [...] } });
  }
  // Fastify's OWN framework errors (bad Content-Type, oversized body,
  // malformed JSON) already carry a correct, safe statusCode < 500 — pass
  // those through instead of flattening everything into a 500.
  if (error.statusCode && error.statusCode < 500) {
    return reply.code(error.statusCode).send({ success: false, error: { code: error.code ?? 'BAD_REQUEST', message: error.message } });
  }
  request.log.error(error);
  return reply.code(500).send({ success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Something went wrong' } });
});
```

Routes just `throw` — no per-route `try/catch`:

```typescript
// src/modules/appointments/appointment.routes.ts
if (!appointment) {
  throw AppError.notFound('Appointment not found', 'APPOINTMENT_NOT_FOUND');
}
```

Verified, all three categories produce the same consistent envelope:

```bash
curl http://localhost:3000/appointments/does-not-exist
# {"success":false,"error":{"code":"APPOINTMENT_NOT_FOUND","message":"Appointment not found"}}

curl -X POST http://localhost:3000/appointments -H "Content-Type: application/json" -d '{"userName":"Sam"}'
# {"success":false,"error":{"code":"VALIDATION_ERROR","message":"Request validation failed","details":[...]}}

curl http://localhost:3000/this-route-does-not-exist
# {"success":false,"error":{"code":"ROUTE_NOT_FOUND","message":"Route GET /this-route-does-not-exist not found"}}
```

## A real bug this project hit while building this handler

The first version of this handler's fallback branch treated *every* error
that wasn't an `AppError` or a validation error as an unexpected 500. That's
wrong: posting to `/appointments` **without** a `Content-Type: application/json`
header throws Fastify's own `FST_ERR_CTP_INVALID_MEDIA_TYPE`, a completely
expected, safe-to-describe error with its own correct `statusCode: 415` —
but the handler was discarding that and always responding `500`:

```bash
curl -X POST http://localhost:3000/appointments -d '{}'   # no Content-Type header
# before the fix: 500 { "code": "INTERNAL_SERVER_ERROR", "message": "Something went wrong" }
# after the fix:  415 { "code": "FST_ERR_CTP_INVALID_MEDIA_TYPE", "message": "Unsupported Media Type" }
```

The fix: check `error.statusCode` and pass through anything already `< 500`
before falling back to the generic 500 — see the `error.statusCode < 500`
branch above. The lesson generalizes: **only errors with no
statusCode (or a 5xx one) are real, unexpected bugs**; plenty of thrown
errors — including several Fastify throws itself — already know their
correct, safe-to-expose 4xx status and message.

## Important details

- **`setErrorHandler` and `setNotFoundHandler` must be registered with
  `fastify-plugin`** if declared inside a separate plugin file, exactly like
  any other global concern (see [10-plugins.md](10-plugins.md)) — otherwise
  they'd only apply to routes registered inside that same plugin, which
  defeats the purpose of a *global* error handler.
- **Never leak unexpected error details.** The fallback branch logs the full
  error server-side (`request.log.error(error)`, which includes the stack
  trace in the log output) but only ever sends the client a generic message
  and an `INTERNAL_SERVER_ERROR` code — the client never sees a stack trace,
  a database error string, or any other internal detail.
- **Validation errors vs. business errors vs. bugs are different categories**
  on purpose: validation errors are the client's fault (malformed input) and
  safe to describe precisely; `AppError`s are expected business conditions
  (also safe to describe, since you wrote the message); anything else is
  potentially a real bug and gets the generic treatment.
- `error.validation` is how you distinguish a schema validation failure from
  any other thrown error (see [14-validation.md](14-validation.md)) — check
  for it explicitly rather than trying to catch a specific error class, since
  Fastify constructs these errors internally.

## Common mistakes

- Checking `error.validation` before checking `instanceof AppError` — since
  `AppError` never has a `.validation` property, checking order doesn't
  actually matter here, but checking your **own** known error types first is
  still the clearer, more intention-revealing structure.
- Sending `error.message` directly to the client for *unexpected* errors —
  a database connection string or internal path can leak this way. Always
  hard-code the message for the generic 500 branch.
- Forgetting `setNotFoundHandler` entirely and letting Fastify's plain
  default 404 response (a different JSON shape) slip through, breaking the
  "every response has the same error envelope" guarantee.

## Best practices

- One error class hierarchy (or even just one `AppError` with a `code` and
  `statusCode`, as here) for all *expected* errors, thrown from anywhere,
  caught in exactly one place.
- Keep the error response shape identical across validation errors, business
  errors, and unexpected errors — callers should only ever need to parse one
  shape (`{ success: false, error: { code, message, details? } }` in this
  project).

## Express comparison

| | Express | Fastify |
|---|---|---|
| Central error handling | A special 4-arg middleware `(err, req, res, next)`, must be registered *last* | `app.setErrorHandler()`, order-independent |
| 404 handling | A catch-all route registered last | `app.setNotFoundHandler()`, explicit and separate |
| Async errors | Must be manually forwarded via `next(err)` inside every `try/catch` | Any thrown error in an `async` handler/hook is caught automatically |

## Interview questions

1. What's the difference between `setErrorHandler` and `setNotFoundHandler`?
2. How does Fastify distinguish a schema validation error from any other thrown error?
3. Why must a global error handler be registered with `fastify-plugin` if it lives in its own plugin file?
4. What's the danger of sending `error.message` straight to the client for an unexpected error?

## Interview answer

> Fastify centralizes error handling into `setErrorHandler()` (for anything
> thrown during the request lifecycle, including its own validation errors)
> and `setNotFoundHandler()` (for unmatched routes), instead of Express's
> convention of a catch-all 4-argument middleware that must be registered
> last. In this project, a global handler distinguishes three cases — known
> `AppError`s (business errors, safe to describe precisely), Fastify's own
> validation errors (identified via `error.validation`), and anything else
> (logged in full server-side, but only ever reported to the client as a
> generic message) — so every response follows the exact same error shape
> and internal details never leak to the client.
