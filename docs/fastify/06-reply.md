# The Reply Object

## What is it?

The second argument passed to every route handler (`reply` in this project).
It wraps Node's raw `http.ServerResponse` and provides a chainable API for
setting the status code, headers, and body of the response.

## Why does Fastify have it?

Node's raw `res` object is low-level (`res.writeHead`, `res.end`) and easy to
misuse (e.g. calling `res.end()` twice). Fastify's `reply` wraps it with a
small, chainable, higher-level API, and integrates with schema-based response
serialization (Phase 3) so the body is stringified consistently and fast.

## How does it work?

```typescript
reply.code(201)        // sets the HTTP status code (alias: reply.status(201))
reply.header('x-foo', 'bar')  // sets one header
reply.headers({ ... }) // sets multiple headers at once
reply.type('application/json') // sets Content-Type
reply.send(payload)    // sends the response body and ends the response
reply.redirect('/somewhere') // sends a 3xx redirect
```

Methods that don't end the response (`code`, `header`, `type`) return `reply`
itself, so they chain:

```typescript
reply.code(201).header('x-custom', '1').send(payload);
```

### Returning vs. calling `reply.send()`

Because handlers are `async` functions, Fastify accepts **either**:

```typescript
// Option A — return the value directly
app.get('/x', async () => {
  return { ok: true }; // Fastify calls reply.send() for you
});

// Option B — call reply.send() explicitly
app.get('/x', async (request, reply) => {
  reply.send({ ok: true });
});
```

**Returning directly is preferable** whenever you have no need to set a
non-default status code or extra headers first — it's shorter and there's no
risk of accidentally calling `reply.send()` twice. Use `reply.code()` /
`reply.send()` explicitly whenever the status code needs to be anything other
than the default `200` (e.g. `201 Created`, `404 Not Found`), since there's no
"return with a status code" shorthand.

## Application example

In [src/modules/appointments/appointment.routes.ts](../../src/modules/appointments/appointment.routes.ts):

```typescript
// Explicit reply, because the status code isn't the 200 default
if (!appointment) {
  return reply.code(404).send({ message: 'Appointment not found' });
}
return reply.code(200).send(appointment);

// POST returns 201 Created, since a new resource was made
return reply.code(201).send(appointment);
```

The root route in [src/app.ts](../../src/app.ts) instead just returns a plain
object — a `200` with a JSON body is exactly Fastify's default, so there's
nothing extra to configure:

```typescript
app.get('/', async () => {
  return { message: 'Fastify Appointment API — Phase 1' };
});
```

## Important details

- `reply.send()` (or an equivalent `return`) can only run once per request —
  calling it twice throws `FST_ERR_REP_ALREADY_SENT`.
- If a handler returns an object/array, Fastify serializes it to JSON and
  sets `Content-Type: application/json` automatically; returning a string
  sets `text/plain` (or `text/html` if it looks like markup).
- `reply.code()` must be called **before** `.send()` — once sent, the status
  line has already been written to the socket.

## Common mistakes

- Calling `reply.send()` and then also `return`-ing a different value from
  the same handler — the `return`ed value is ignored (the first `send()`
  wins), which is confusing to debug. Pick one style per handler.
- Forgetting `reply.code(...)` for non-200 responses and always returning
  `200`, even for errors or created resources.
- Mutating `reply` after an `await` that itself might have already responded
  (e.g. in a hook) — always assume only one code path sends the reply.

## Best practices

- Default to `return value;` for the common case; drop to
  `reply.code(x).send(value)` only when a non-default status or header is
  needed.
- Keep status codes meaningful and consistent: `200` for a successful read,
  `201` for a created resource, `404` for missing, etc.

## Express comparison

| | Express | Fastify |
|---|---|---|
| Set status | `res.status(201)` | `reply.code(201)` (alias `reply.status()`) |
| Send JSON | `res.json(data)` | `reply.send(data)` or just `return data` |
| Set header | `res.set('x', 'y')` | `reply.header('x', 'y')` |
| Redirect | `res.redirect('/x')` | `reply.redirect('/x')` |
| Return from async handler | Ignored — must call `res.send()` | Fully supported; the return value becomes the response |

## Interview questions

1. What is the difference between `reply.send()` and returning a value from an `async` handler?
2. When must you use `reply.code()` explicitly instead of just returning a value?
3. What happens if you call `reply.send()` twice in the same handler?
4. How does Fastify decide the `Content-Type` of a response?

## Interview answer

> `reply` wraps the raw Node response with a chainable API (`code`, `header`,
> `type`, `send`, `redirect`). Since Fastify handlers are `async` functions,
> returning a value directly is equivalent to calling `reply.send()` with it
> and is preferred for the common 200-response case; `reply.code()` is only
> needed when the status isn't the default. Fastify infers `Content-Type`
> from the returned value's type (object/array → JSON, string → text), and
> will throw if you try to send a response more than once for the same
> request.
