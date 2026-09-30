# The Request Object

## What is it?

The first argument passed to every route handler (`request` in this project's
convention, sometimes written `req`). It wraps Node's raw `http.IncomingMessage`
and exposes everything about the incoming HTTP call: URL params, query
string, body, headers, and metadata Fastify adds itself (like a request ID).

## Why does Fastify have it?

Handlers need a consistent, framework-normalized view of "what did the client
send," regardless of how the data arrived (URL segment, query string, JSON
body, header). Fastify also uses the request object as the anchor point for
decorators (see [12-decorators.md](12-decorators.md)) like `request.user`,
added later in Phase 5's authentication hook.

## How does it work?

Common properties, all present on every request:

```typescript
request.params   // route params, e.g. { id: '123' } for /appointments/:id
request.query    // parsed query string, e.g. { status: 'CONFIRMED' }
request.body     // parsed request body (JSON by default)
request.headers  // raw HTTP headers, lowercased keys
request.cookies  // present once @fastify/cookie is registered (Phase 5)
request.id       // a unique ID Fastify generates per request, used in logs
request.ip       // client IP address
request.method   // 'GET', 'POST', etc.
request.url      // the raw path + query string requested
```

Until schemas are added (Phase 3), `params`, `query`, and `body` are typed as
`unknown`/loosely-typed by Fastify — this project currently narrows them with
an explicit type assertion (e.g. `request.params as { id: string }`), and
switches to schema-inferred types in Level 3.

## Simple example

```typescript
app.get('/greet/:name', async (request) => {
  const { name } = request.params as { name: string };
  return { message: `Hello, ${name}` };
});
```

Calling `GET /greet/Sam` produces `{ "message": "Hello, Sam" }` —
`request.params.name` is `'Sam'`, extracted by Fastify's router from the
`:name` segment of the route pattern.

## Application example

In [src/modules/appointments/appointment.routes.ts](../../src/modules/appointments/appointment.routes.ts):

```typescript
// GET /appointments/:id
app.get('/appointments/:id', async (request, reply) => {
  const { id } = request.params as { id: string };
  const appointment = appointments.find((a) => a.id === id);
  // ...
});
```

For `GET /appointments/123`, `request.params.id` is `'123'` — Fastify's router
matched the `:id` segment of the registered pattern against the path and
placed the captured value on `request.params`.

The `GET /appointments` handler reads `request.query.status` to filter
results, and `POST /appointments` reads `request.body` for the new
appointment's fields — same object, three different sources on the same
`request`.

## Important details

- `request.body` is only populated for methods that typically carry a body
  (`POST`, `PUT`, `PATCH`) and only once Fastify's body parser has run
  (`application/json` is parsed by default; other content types need their
  own parser).
- `request.query` values are **always strings** (or arrays of strings for
  repeated keys) — `?limit=10` gives `request.query.limit === '10'`, not the
  number `10`, until a schema with `type: 'integer'` coerces it.
- `request.id` is extremely useful for correlating one request across
  multiple log lines — see [17-logging.md](17-logging.md).

## Common mistakes

- Trusting `request.body`'s shape without validation and letting bad data
  reach business logic or the database — fixed properly in
  [14-validation.md](14-validation.md); this project's Phase 1 code uses `as`
  casts only as a temporary stand-in.
- Assuming `request.query.limit` is a number and doing math on it directly
  without parsing/coercing first.
- Reading `request.headers['Content-Type']` (capitalized) — headers are
  normalized to **lowercase** keys, so it must be `request.headers['content-type']`.

## Best practices

- Narrow `params`/`query`/`body` as close to the top of the handler as
  possible, and prefer schema-driven types (Phase 3) over manual `as` casts
  as soon as they're available.
- Use `request.id` in any custom log lines so they can be correlated with
  Fastify's own access logs for that request.

## Express comparison

| | Express | Fastify |
|---|---|---|
| Route params | `req.params` | `request.params` |
| Query string | `req.query` (qs-parsed) | `request.query` (also parsed, coercible via schema) |
| Body | `req.body` (needs `express.json()` middleware) | `request.body` (JSON parsed out of the box) |
| Per-request ID | Not built-in (needs middleware like `express-request-id`) | `request.id`, built-in |
| Type safety | `any` unless manually typed | Inferred from JSON Schema once one is attached (Phase 3) |

## Interview questions

1. What's the difference between `request.params`, `request.query`, and `request.body`?
2. Why are query string values always strings even for something like `?page=2`?
3. What is `request.id` and what is it useful for?
4. Why shouldn't you trust `request.body`'s shape without validation?

## Interview answer

> The Fastify `request` object normalizes everything about an incoming HTTP
> call — `params` from the URL pattern, `query` from the query string,
> `body` from the parsed payload, plus framework metadata like `request.id`
> for log correlation. Query and param values arrive as strings by default
> since they come from raw URL text; only attaching a JSON Schema (Phase 3)
> makes Fastify coerce and type them properly. Until then, anything read off
> `request` should be treated as untrusted, loosely-typed input.
