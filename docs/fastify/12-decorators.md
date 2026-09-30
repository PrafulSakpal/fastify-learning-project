# Decorators

## What is it?

A way to attach a custom property or method to the Fastify instance, every
`request`, or every `reply`, so it can be reused across routes and plugins
without re-declaring it each time.

```typescript
fastify.decorate('name', value)         // adds to the Fastify instance
fastify.decorateRequest('name', value)  // adds to every `request`
fastify.decorateReply('name', value)    // adds to every `reply`
```

## Why does Fastify have it?

Two problems decorators solve:

1. **Sharing utilities/state** without importing them into every file (e.g.
   a database client attached as `app.db`, or an authenticated user attached
   as `request.user`).
2. **Performance and correctness**, compared to just assigning a plain
   property (`request.user = ...`) at runtime: `decorateRequest`/`decorateReply`
   pre-allocate the property on Fastify's internal request/reply prototypes,
   which keeps V8's hidden class optimizations intact — plain ad hoc property
   assignment can deoptimize the object shape across many requests.

## How does it work?

```typescript
// Instance decorator — one value, shared by the whole app
app.decorate('appName', 'Fastify Appointment API');
app.appName; // 'Fastify Appointment API'

// Request decorator — MUST be given a primitive default; each request gets
// its own value assigned later (typically in an onRequest/preHandler hook)
app.decorateRequest('startTime', 0);
app.addHook('onRequest', async (request) => {
  request.startTime = Date.now(); // safe: each request's own start time
});

// Reply decorator — usually a function, called as a method on `reply`
app.decorateReply('success', function (this: FastifyReply, data: unknown, code = 200) {
  return this.code(code).send({ success: true, data });
});
```

Decorators are subject to [encapsulation](11-encapsulation.md): a decorator
added inside a plain (non-`fp`) plugin is only visible inside that plugin.

## Simple example

```typescript
app.decorate('formatCurrency', (cents: number) => `$${(cents / 100).toFixed(2)}`);

app.get('/price', async () => ({
  price: app.formatCurrency(1999), // '$19.99'
}));
```

## Application example

This project declares three decorators, in [src/app.ts](../../src/app.ts)
and [src/plugins/request-timing.ts](../../src/plugins/request-timing.ts):

```typescript
app.decorate('appName', 'Fastify Appointment API');   // instance decorator

app.decorateReply('success', function (this: FastifyReply, data, code = 200) {
  return this.code(code).send({ success: true, data });
});                                                     // reply decorator

app.decorateRequest('startTime', 0);                   // request decorator
```

Used together in the root route:

```typescript
app.get('/', async (request, reply) => {
  return reply.success({ message: `${app.appName} — Phase 2` });
});
```

`request.startTime` is used by the timing hooks (not read in any route
handler directly) — see [08-hooks.md](08-hooks.md).

TypeScript needs to be told these properties exist, since they're added at
runtime, not statically declared on the class. This project does that with a
**module augmentation** file:
[src/common/types/fastify.d.ts](../../src/common/types/fastify.d.ts):

```typescript
declare module 'fastify' {
  interface FastifyInstance { appName: string; }
  interface FastifyRequest { startTime: number; }
  interface FastifyReply { success(data: unknown, code?: number): FastifyReply; }
}
```

Without this file, `app.appName`, `request.startTime`, and `reply.success()`
would all be TypeScript compile errors, even though they work fine at runtime.

## Important details

- `decorateRequest`/`decorateReply` defaults **must be primitives** (or
  `null`/omitted) — never an object or array literal. In Fastify v4 this
  was just a convention; **Fastify v5 (used in this project) enforces it**,
  throwing `FST_ERR_DEC_REFERENCE_TYPE` at registration time if you pass a
  reference type. See [decorator-example.ts](../examples/decorator-example.ts)
  for the exact error and the fix.
- Decorators vs. ordinary properties: you *can* just do
  `(request as any).foo = 'bar'` without decorating first, but you lose
  TypeScript safety (without the `.d.ts` augmentation) and the V8 shape
  optimization decorators provide.
- Decorators respect encapsulation — see [11-encapsulation.md](11-encapsulation.md).

## Common mistakes

- **The classic decorator bug**: `app.decorateRequest('user', {})` — using an
  object literal as the default. In Fastify v4 every request would silently
  share the *same* object reference until something reassigned it, so
  writing `request.user.role = 'x'` in one request could leak into a
  concurrently-processed request. Fastify v5 now catches this for you at
  startup (`FST_ERR_DEC_REFERENCE_TYPE`) — but the fix is the same either
  way: default to a primitive (or omit the value/use `null`) and *assign* a
  fresh object per request inside a hook instead.
- Forgetting the TypeScript module augmentation and then sprinkling `as any`
  everywhere a decorator is used, instead of declaring it once.
- Re-decorating the same name twice — Fastify throws
  (`FST_ERR_DEC_ALREADY_PRESENT`) rather than silently overwriting, which is
  a deliberate safety net.

## Best practices

- Use `decorate` for shared, stateless utilities or shared clients (db, redis).
- Use `decorateRequest` for anything that varies per request (timers, the
  authenticated user, a request-scoped correlation ID).
- Use `decorateReply` for reusable response-shaping helpers (like `success()`
  here, or an `error()` counterpart added in Phase 3).
- Always pair a decorator with a `declare module 'fastify' { ... }`
  augmentation so the rest of the codebase gets full type safety.

## Express comparison

| | Express | Fastify |
|---|---|---|
| Attach shared state | `app.locals.foo = ...` or `req.foo = ...` ad hoc | `app.decorate()` / `decorateRequest()` / `decorateReply()` |
| Type safety | `req` is `any`-ish unless manually typed | Enforced via `declare module 'fastify'` augmentation |
| Duplicate-safety | Silent overwrite | Throws on redeclaration |
| Performance concern | None documented — plain object mutation | Primitive defaults keep V8 object shapes stable |

## Interview questions

1. What are the three kinds of Fastify decorators and when do you use each?
2. Why must `decorateRequest`/`decorateReply` defaults be primitives, not objects?
3. What happens if you try to decorate the same name twice?
4. Why is a decorator preferable to just assigning `request.foo = ...` directly?

## Interview answer

> Fastify decorators (`decorate`, `decorateRequest`, `decorateReply`) attach
> reusable properties or methods to the instance, request, or reply. They're
> preferred over ad hoc property assignment for two reasons: they give
> TypeScript something to type-check against via module augmentation, and —
> for request/reply — they pre-declare the property with a primitive default
> so every request's object shape stays consistent for V8's optimizer. The
> classic bug was defaulting `decorateRequest` to an object literal instead
> of a primitive, sharing one object reference across all requests; Fastify
> v5 now turns that into a hard startup error (`FST_ERR_DEC_REFERENCE_TYPE`)
> instead of a silent data leak, forcing you to assign a fresh object per
> request inside a hook instead.
