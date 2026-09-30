# Validation

## What is it?

The runtime check Fastify performs against `params`/`querystring`/`body`/`headers`
before your handler ever runs, using the schema attached to the route (see
[13-json-schema.md](13-json-schema.md)). This is distinct from TypeScript's
compile-time checking — TypeScript never runs at all once the code is compiled;
validation is what actually protects the running server from bad input.

## Why does Fastify have it?

TypeScript types are erased at compile time — they guarantee nothing about
what a real HTTP client actually sends over the wire (a client can send any
bytes it wants, regardless of what your `interface` says). Runtime validation
is the only real gate against malformed input, and Fastify makes it
declarative and automatic instead of a manual `if` per field.

## How does it work?

For each schema key (`params`, `querystring`, `body`, `headers`), Fastify
runs the compiled AJV validator before the handler. If it fails, Fastify
throws an error with a `.validation` array attached, and the request never
reaches the handler — in this project, that error is caught by the global
error handler (see [16-error-handling.md](16-error-handling.md)) and turned
into a consistent `400`.

### TypeScript validation vs. runtime validation

| | TypeScript | Fastify runtime validation |
|---|---|---|
| When it runs | Only at build time (`tsc`) | On every real request |
| What it checks | Code you wrote | Actual bytes a client sent |
| Enforced by | The compiler, then erased | AJV, compiled from your JSON Schema |
| Protects against | Your own logic errors | A malicious or buggy client |

Both matter, for different reasons — this project uses the JSON Schema as
the single source for **both** (see [13-json-schema.md](13-json-schema.md)),
so they can't disagree with each other.

## Simple example

```json
POST /subscribe
{ "email": "wrong-email" }
```

With `email: { type: 'string', format: 'email' }` in the schema, Fastify
responds `400` before the handler runs, with a `.validation` entry like
`{ instancePath: '/email', message: 'must match format "email"' }`.

## Application example

Verified directly against the running app — three different validation
failures, each producing the same consistent shape via the global error
handler:

```bash
# invalid enum value
curl "http://localhost:3000/appointments?status=NOT_A_STATUS"
# {"success":false,"error":{"code":"VALIDATION_ERROR","message":"Request validation failed",
#   "details":[{"field":"/status","message":"must be equal to one of the allowed values"}]}}

# missing required field
curl -X POST http://localhost:3000/appointments -H "Content-Type: application/json" -d '{"userName":"Sam"}'
# {"success":false,"error":{"code":"VALIDATION_ERROR","message":"Request validation failed",
#   "details":[{"field":"#/required","message":"must have required property 'serviceName'"}]}}

# empty PATCH body (minProperties: 1)
curl -X PATCH http://localhost:3000/appointments/<id> -H "Content-Type: application/json" -d '{}'
# 400 — updateAppointmentBodySchema requires at least one field to update
```

Query coercion is also validation's job: `page`/`limit` on
`GET /appointments` arrive as query-string text but are typed (and actually
coerced at runtime) to `number`, per `appointmentQuerystringSchema`.

## Important details

- **Only one error at a time, by default.** Fastify's AJV defaults set
  `allErrors: false`, so `error.validation` contains just the *first* failure
  AJV hits — not every problem with the request. A body missing three
  required fields still reports only one in `details`, confirmed above with
  the single-item `details` array. Fixing this (if you want every error at
  once) means passing a custom AJV instance with `allErrors: true` — not
  something this project needs, but worth knowing before it surprises you.
- **Coercion happens silently.** With `coerceTypes: 'array'` (Fastify's
  default), `?limit=10` becomes the number `10` automatically — useful, but
  means a query string that merely *looks* numeric (`"010"`, `"1e2"`) will
  also coerce, which can matter for stricter numeric validation.
- Validation runs at the `preValidation`/`Validation` lifecycle stages (see
  [09-lifecycle.md](09-lifecycle.md)) — after `preParsing`, before `preHandler`.

## Common mistakes

- Assuming a passing TypeScript build means the API is "safe" — it says
  nothing about what a real client sends at runtime.
- Expecting `details` to list every invalid field — it only lists the first,
  under Fastify's default AJV options.
- Forgetting that query values need explicit `type: 'integer'`/`'number'` in
  the schema to be coerced — without it, `request.query.page` stays a string
  even though it "looks like" a number.

## Best practices

- Treat the JSON Schema as the actual contract, and let the type provider
  derive TypeScript types from it (see [13-json-schema.md](13-json-schema.md))
  rather than trusting a hand-written interface to match reality.
- If you need every validation error at once (e.g. for a form with several
  fields), explicitly configure AJV with `allErrors: true` rather than
  assuming it's already on.

## Express comparison

Express requests are validated (if at all) by whichever library you choose
and wire in yourself — there's no framework-level default, so codebases
often end up with inconsistent validation approaches across routes. Fastify
validates every schema-bearing route the same way, automatically, with no
extra middleware to remember to attach.

## Interview questions

1. Why isn't a TypeScript type check equivalent to runtime validation?
2. Does Fastify's default validation report every invalid field, or just one? Why does that matter?
3. What does `coerceTypes` do, and where might it surprise you?
4. At what point in the request lifecycle does validation happen relative to the handler?

## Interview answer

> TypeScript validation is a compile-time guarantee about code you wrote; it
> says nothing about what a real client actually sends, since types are
> erased before runtime. Fastify's runtime validation, driven by the same
> JSON Schema, is what actually protects the server — it runs before the
> handler and rejects malformed `params`/`query`/`body` with a consistent
> error. One easy-to-miss detail: Fastify's default AJV configuration sets
> `allErrors: false`, so a request with multiple problems only reports the
> first one unless you explicitly opt into collecting all of them.
