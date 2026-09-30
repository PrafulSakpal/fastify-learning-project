# JWT Authentication

## What is it?

A stateless authentication scheme: the server issues a signed token (a JWT —
JSON Web Token) after a successful login, the client sends it back on every
subsequent request (`Authorization: Bearer <token>`), and the server
verifies its signature — no server-side session store required. This
project uses `@fastify/jwt`.

## Why does Fastify have it?

Fastify itself has no built-in auth — `@fastify/jwt` is a plugin, following
the same plugin/decorator model as everything else in this app (see
[10-plugins.md](10-plugins.md)). What Fastify *does* provide is the right
place to hook verification into the request lifecycle (a `preHandler`, see
[08-hooks.md](08-hooks.md)) and to type the result (`request.user`, via
decorator/module-augmentation, see [12-decorators.md](12-decorators.md)) —
JWT verification is really just a specific, well-supported case of the
general hook + decorator pattern already used throughout this project.

## How it works

### 1. Register — create the account (no token issued)

```typescript
// POST /auth/register
const user = await app.prisma.user.create({
  data: { name, email, password: await hashPassword(password) },
});
return reply.code(201).send(toUserResponse(user)); // password never included
```

### 2. Login — verify credentials, sign a token

```typescript
// POST /auth/login
const user = await app.prisma.user.findUnique({ where: { email } });

if (!user || !(await verifyPassword(password, user.password))) {
  throw AppError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
}

const accessToken = await app.jwt.sign(
  { sub: user.id, email: user.email },
  { expiresIn: '1h' },
);
return reply.code(200).send({ accessToken, expiresIn: '1h' });
```

### 3. The authentication hook — reusable across any route

```typescript
// src/plugins/jwt.ts
app.decorate('authenticate', async function (request, reply) {
  await request.jwtVerify(); // throws its own 401 FastifyError if missing/invalid/expired
});
```

### 4. Protecting a route with it

```typescript
// GET /auth/me
app.get('/auth/me', { schema: meSchema, preHandler: [app.authenticate] }, async (request, reply) => {
  const user = await app.prisma.user.findUnique({ where: { id: request.user.sub } });
  // ...
});
```

`preHandler: [app.authenticate]` is a **route-level** option (see
[07-route-options.md](07-route-options.md)) — only routes that list it
require a token. `/auth/register` and `/auth/login` don't, and remain public.

## Application example

All of the above is real code, verified against the running app:

```bash
curl -X POST http://localhost:3000/auth/register -H "Content-Type: application/json" \
  -d '{"name":"Alice","email":"alice@example.com","password":"correct-horse-battery"}'
# 201 { "id": "...", "name": "Alice", "email": "alice@example.com", ... } — no password field

curl -X POST http://localhost:3000/auth/login -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"wrong"}'
# {"success":false,"error":{"code":"INVALID_CREDENTIALS","message":"Invalid email or password"}}

curl -X POST http://localhost:3000/auth/login -H "Content-Type: application/json" \
  -d '{"email":"nobody@example.com","password":"whatever"}'
# SAME message — doesn't reveal whether the email exists

curl http://localhost:3000/auth/me
# {"success":false,"error":{"code":"FST_JWT_NO_AUTHORIZATION_IN_HEADER", ...}}

curl http://localhost:3000/auth/me -H "Authorization: Bearer <real-token>"
# 200 { "id": "...", "name": "Alice", ... }
```

Notice the 401 responses above already carry `@fastify/jwt`'s own error
codes (`FST_JWT_NO_AUTHORIZATION_IN_HEADER`,
`FST_JWT_AUTHORIZATION_TOKEN_INVALID`) in this project's standard error
envelope — with **zero extra code**, because `request.jwtVerify()` throws a
real `FastifyError` with its own correct `statusCode: 401`, caught by the
same `error.statusCode < 500` passthrough branch in
[error-handler.ts](../../src/plugins/error-handler.ts) that Phase 3 added to
fix the Content-Type bug (see [16-error-handling.md](16-error-handling.md)).
One generic mechanism, reused for a completely different plugin's errors.

## Important details

- **Password hashing uses Node's built-in `scrypt`**, not a third-party
  library — see [password.ts](../../src/common/utils/password.ts). This
  keeps dependencies minimal; a production system might reach for
  `argon2`/`bcrypt` for tuned defaults, but the principle (salted hash,
  constant-time comparison) is the same.
- **`timingSafeEqual`, not `===`**, compares the derived key against the
  stored hash — a plain `===` on strings/buffers can leak *how many leading
  bytes matched* through response-time differences (a real, if narrow,
  timing-attack vector).
- **The JWT payload is minimal on purpose**: `{ sub: userId, email }`, never
  the password hash or other sensitive fields — a JWT's payload is
  base64url-*encoded*, not encrypted, so anyone holding the token can decode
  and read it (try pasting the `accessToken` from the login response into
  [jwt.io](https://jwt.io)).
- **Same error for "no such user" and "wrong password"** at login — a
  security choice (prevents account enumeration), not an accident. This is
  also why login validates less strictly than registration (no `minLength`
  on login's password) — the schema's job at login is just "is this a
  string," not "is this a good password."
- **`request.user`'s type comes from module augmentation** on
  `@fastify/jwt`'s own `FastifyJWT` interface (see
  [fastify.d.ts](../../src/common/types/fastify.d.ts)) — the same mechanism
  used for every other decorator in this project.

## Common mistakes

- Putting sensitive data (password hash, full user object) in the JWT
  payload — it's readable by anyone with the token.
- Giving login and registration different error messages for "user not
  found" vs. "wrong password" — leaks which emails are registered.
- Comparing password hashes with `===`/`Buffer.equals()` instead of
  `timingSafeEqual`.
- Forgetting `expiresIn` entirely — an access token that never expires
  defeats a major benefit of short-lived tokens (a leaked token is only
  useful for a bounded window).

## Best practices

- Keep the JWT payload small and non-sensitive; look up anything else
  (like the full user profile) from the database using the `sub` claim.
- Give an access token a short expiry (this project uses `1h`); a real
  production system would pair this with a refresh-token flow — deliberately
  out of scope here, to keep auth simple per this project's own goals.
- Reuse the same generic error-handling passthrough for third-party plugin
  errors (like `@fastify/jwt`'s) instead of writing bespoke handling for
  every plugin.

## Express comparison

| | Express | Fastify |
|---|---|---|
| Auth library | Typically Passport.js + `passport-jwt`, or manual | `@fastify/jwt`, a thin wrapper over `jsonwebtoken` |
| Protecting a route | A middleware function inserted before the handler | A route-level `preHandler` option |
| Attaching the verified user | `req.user = payload` (manual) | `request.user`, typed via module augmentation |
| Session alternative | `express-session` + a store (Redis, etc.) | Not needed for JWT — stateless by design |

## Interview questions

1. What's the difference between a JWT-based and a session-based
   authentication scheme, and which is stateless?
2. Why should a JWT payload avoid sensitive data?
3. Why does this project return the same error for "no such user" and
   "wrong password"?
4. How does `GET /auth/me` end up returning a 401 with zero custom
   auth-specific error-handling code?

## Interview answer

> This project uses `@fastify/jwt` for stateless authentication: login
> verifies credentials with a scrypt-hashed password (constant-time
> compared), then signs a short-lived JWT carrying only a minimal payload
> (`sub`, `email`) — never the password hash. Protecting a route is just a
> `preHandler: [app.authenticate]` route option, where `authenticate` calls
> `request.jwtVerify()`; that call throws Fastify's own real error (with a
> correct 401 statusCode and a specific code) on a missing, malformed, or
> expired token, which the app's *existing* generic error-handling
> passthrough — added back in Phase 3 for an unrelated Content-Type bug —
> already formats consistently, with no JWT-specific error code required.
