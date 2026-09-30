# Cookies

## What is it?

An HTTP header (`Set-Cookie` / `Cookie`) the browser stores and automatically
resends with every request to the same origin. In Fastify, `request.cookies`
and `reply.setCookie()` are added by the `@fastify/cookie` plugin — cookies
aren't parsed or sent by Fastify core on their own.

## Why doesn't this app use cookies for authentication?

**This app deliberately doesn't.** Its auth (Phase 5,
[20-jwt.md](20-jwt.md)) is a JWT sent via the `Authorization: Bearer <token>`
header, not a cookie — a deliberate, common choice for an API consumed by
non-browser clients (mobile apps, `curl`, another backend service) where
there's no browser to automatically manage cookies anyway. This doc exists
because cookies are still an important Fastify concept and a common
follow-up question ("why not just use a cookie instead of a JWT header?"),
even though nothing in this codebase wires it up.

## How it would work

```typescript
import fastifyCookie from '@fastify/cookie';

app.register(fastifyCookie);

app.get('/set', async (request, reply) => {
  reply.setCookie('sessionId', 'abc123', {
    httpOnly: true, // JavaScript can't read it — mitigates XSS token theft
    secure: true,    // only sent over HTTPS
    sameSite: 'lax', // mitigates CSRF from cross-site requests
    path: '/',
  });
  return { ok: true };
});

app.get('/read', async (request) => {
  return { sessionId: request.cookies.sessionId };
});
```

## Important details

- **Cookies are sent automatically by the browser**; a JWT in a header is
  not — the client code must explicitly attach it. This is exactly why a
  cookie-based session is vulnerable to CSRF (a *different* site can trigger
  a request that automatically carries the cookie) in a way a header-based
  token isn't (a different site can't make the browser attach an
  `Authorization` header on its own).
- **`httpOnly` cookies can't be read by client-side JavaScript** — a real
  defense against XSS-based token theft that a JWT stored in
  `localStorage`/`sessionStorage` doesn't get for free (any injected script
  can read `localStorage`).
- A signed cookie (`@fastify/cookie`'s `signed: true` option, paired with a
  secret) detects tampering, similar in spirit to a JWT's signature — but a
  signed cookie's *value* still isn't encrypted, same caveat as a JWT
  payload (see [20-jwt.md](20-jwt.md)).

## When cookies are the better fit

- A traditional server-rendered app (no separate frontend JS app), where the
  browser is always the client and CSRF protections (`sameSite`, CSRF
  tokens) are already part of the toolkit.
- Needing `httpOnly` protection against XSS for a long-lived session/refresh
  token, which a header-based token stored in JS-accessible storage can't
  offer.

## When a header-based token (this app's choice) is the better fit

- Any non-browser client (mobile apps, other services, CLI tools).
- An API consumed by a separate frontend origin, where cookie `SameSite`
  rules would otherwise complicate cross-origin requests.

## Common mistakes

- Storing a JWT in `localStorage` "to avoid cookie complexity" without
  realizing this trades CSRF risk for XSS risk — neither storage location is
  risk-free; the right choice depends on the actual threat model.
- Forgetting `httpOnly`/`secure`/`sameSite` on an auth cookie, turning it
  into a plain, unprotected value in every sense a JWT header already is.

## Best practices

- Set `httpOnly`, `secure`, and an appropriate `sameSite` on any
  authentication-related cookie.
- Don't reach for cookies (or `@fastify/cookie`) just because a tutorial
  used them — pick based on who the actual client is, exactly like this
  project picked a header-based JWT because its primary "client" in the
  examples throughout these docs is `curl`, not a browser session.

## Express comparison

Express's `cookie-parser` middleware plays the same role as
`@fastify/cookie` — parsing `Cookie` and setting `Set-Cookie` — with a very
similar API. Nothing about cookies themselves is Fastify- or
Express-specific; both are wrapping the same underlying HTTP mechanism.

## Interview questions

1. Why does a cookie-based session need CSRF protection in a way a
   header-based JWT typically doesn't?
2. What does `httpOnly` protect against, and what doesn't it protect against?
3. Why does this project's Appointment API use a header-based JWT instead
   of a cookie?
4. Is a signed cookie's value encrypted?

## Interview answer

> Cookies are sent automatically by the browser on every request to their
> origin, which is exactly what makes them vulnerable to CSRF and exactly
> what makes a header-based token (which must be explicitly attached by
> client code) immune to that specific attack — at the cost of needing the
> client to manage the token itself. This project uses a header-based JWT
> because its primary clients throughout the docs are non-browser tools
> (`curl`), where cookie auto-attachment provides no benefit anyway. Neither
> approach is universally "more secure" — cookies with `httpOnly` protect
> against XSS token theft in a way JS-accessible storage for a header token
> doesn't, so the right choice depends on the actual client and threat model.
