# Response Serialization

## What is it?

Turning a handler's return value into the JSON bytes actually sent over the
wire — driven by the `response` key of a route's schema (keyed per status
code), and compiled by `fast-json-stringify` instead of plain `JSON.stringify`.

## Why does Fastify have it?

Two reasons to declare a response schema, not just let Fastify
`JSON.stringify` whatever the handler returns:

1. **Performance** — a schema-compiled serializer only visits the properties
   it was told about, which is measurably faster than `JSON.stringify`'s
   generic, dynamic-shape walk, especially on large arrays of objects.
2. **Safety** — the serializer only outputs properties **declared in the
   schema**. If your domain object happens to carry a field you never meant
   to expose (a password hash, an internal note), and that field isn't in
   the response schema, it is silently dropped from the output — regardless
   of whether it was actually present on the object the handler returned.

## How does it work?

```typescript
response: {
  200: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
      // passwordHash is NOT listed — it will never appear in the response
    },
  },
}
```

Even if the handler does:

```typescript
return { id: 1, name: 'John', passwordHash: 'secret' };
```

...the client only ever receives `{ "id": 1, "name": "John" }`.

## Simple example

Database object:

```json
{ "id": 1, "name": "John", "passwordHash": "secret" }
```

Response schema:

```typescript
{ type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } }
```

Client sees:

```json
{ "id": 1, "name": "John" }
```

## Application example

This project's `Appointment` domain type carries an `internalNotes` field
(a staff-only note) that `appointmentResponseSchema` deliberately never
lists — see [src/modules/appointments/appointment.schemas.ts](../../src/modules/appointments/appointment.schemas.ts):

```typescript
export const appointmentResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'userName', 'serviceName', 'date', 'startTime', 'status'],
  properties: {
    id: { type: 'string' },
    userName: { type: 'string' },
    serviceName: { type: 'string' },
    date: { type: 'string' },
    startTime: { type: 'string' },
    status: { type: 'string', enum: [/* ... */] },
  },
} as const;
```

The seed record in [appointment.routes.ts](../../src/modules/appointments/appointment.routes.ts)
really does carry `internalNotes: 'Regular client, prefers the 10am slot.'`
in memory — verified it never reaches a client:

```bash
curl http://localhost:3000/appointments
# [{"id":"...","userName":"Jane Doe","serviceName":"Haircut","date":"2026-10-01",
#   "startTime":"10:00","status":"PENDING"}]
#   ↑ no internalNotes field anywhere in the response, despite being on the object
```

## Important details

- **Stripping is the default, but `additionalProperties: true` opts back
  out of it** — verified directly:
  a response schema with no `additionalProperties` key at all drops any
  field not listed in `properties` (e.g. `{ id: '1', secret: 'leak' }` →
  `{ "id": "1" }`); the *same* handler with
  `additionalProperties: true` added to that response schema lets `secret`
  through unchanged (`{ "id": "1", "secret": "leak" }`). So the safety net
  described above only holds as long as you don't explicitly set
  `additionalProperties: true` on a response schema — this project always
  leaves it unset (or `false`) for exactly that reason.
- On the *input* side (a `body` schema), `additionalProperties: false`
  combined with Fastify's default `removeAdditional: true` AJV option means
  extra client-sent fields are **silently stripped from `request.body`
  before validation fails** — not rejected with a 400. Confirmed on this
  project's `POST /appointments`: sending an extra `hacked: true` field
  still returns `201`, with `hacked` simply absent from the stored/returned
  object. If you want unexpected input fields to be a hard `400` instead,
  you need a stricter AJV configuration than Fastify's default.
- A status code with no entry in `response` is sent via plain
  `JSON.stringify`, with no filtering at all — every property that survives
  to `reply.send()` goes out as-is.

## Common mistakes

- Assuming `additionalProperties: false` on a **request body** schema causes
  a `400` for unexpected fields — under Fastify's default AJV options, it
  causes silent stripping instead. Verify this in your own project rather
  than assuming either behavior.
- Relying on remembering to manually omit a sensitive field in every handler
  (`delete user.passwordHash`) instead of declaring a response schema that
  simply never allows it out in the first place.
- Adding a new field to a domain object/database row and expecting it to
  show up in API responses automatically — it won't, until the response
  schema is updated to include it. This is a feature, not a bug, but it's
  easy to forget mid-project.

## Best practices

- Always declare a response schema for anything that touches real
  (eventually persisted) data — it's your enforcement point against
  accidentally leaking internal fields, not just a performance optimization.
- Keep response schemas' `properties` list as the definitive "public shape"
  of a resource, and treat any field not in it as private by default.

## Express comparison

Express has no equivalent — `res.json(obj)` sends exactly the object you
give it, with every property intact. Omitting sensitive fields is entirely
manual discipline (`delete obj.password`, or a hand-picked subset via
object destructuring) with no framework-level backstop if a route forgets.

## Interview questions

1. What two problems does a Fastify response schema solve?
2. If a handler returns an object with a field not listed in the response
   schema, what happens to it?
3. Does `additionalProperties: false` on a request body schema reject or
   strip unexpected fields, under Fastify's defaults?
4. Why is a response schema a better safeguard against leaking sensitive
   fields than remembering to `delete` them in each handler?

## Interview answer

> Fastify compiles a route's `response` schema into a fast serializer via
> `fast-json-stringify`, which only outputs properties the schema actually
> declares — so a domain object carrying an internal-only field (like a
> staff note or password hash) has that field silently dropped from the
> response if it's absent from the schema, regardless of whether the
> handler returned it. This is both a performance win over generic
> `JSON.stringify` and a real safety backstop against accidental data
> leakage, since it doesn't rely on every handler remembering to manually
> strip sensitive fields.
