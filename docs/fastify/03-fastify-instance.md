# The Fastify Instance

## What is it?

The object returned by calling `Fastify(options)`. It's the root of the
entire application: every route, hook, plugin, and decorator is attached to
it (or to an encapsulated child of it — see [11-encapsulation.md](11-encapsulation.md)).
In Express terms, it's the equivalent of `const app = express()`, but it also
absorbs what Express spreads across `app`, `http.Server`, and various
middleware setup calls.

## Why does Fastify have it?

Every framework needs a top-level object to configure and build the server
on. Fastify's version is deliberately a single object with a small, consistent
API (`.get/.post/...`, `.register`, `.decorate`, `.addHook`, `.listen`) so that
plugins receive the exact same kind of object as the top-level app — this
uniformity is what makes encapsulation and the plugin system possible.

## How does it work?

```typescript
import Fastify from 'fastify';

const app = Fastify({
  logger: true,       // enables the built-in Pino logger (see 17-logging.md)
  // other common options: bodyLimit, trustProxy, disableRequestLogging, ajv
});
```

Key methods used across this project:

- **`app.listen({ port, host })`** — binds a real TCP socket and starts
  accepting connections. Returns a Promise that resolves once listening.
- **`app.ready()`** — resolves once every registered plugin has finished
  loading (all `async` setup, like a DB connection in a plugin, has settled).
  Fastify actually calls this internally before the first request is handled;
  you call it explicitly when you need the fully-booted app without binding a
  port (e.g. generating an OpenAPI spec, or in some test setups).
- **`app.close()`** — stops accepting new connections and runs every
  registered `onClose` hook (used for graceful shutdown — see
  [25-graceful-shutdown.md](25-graceful-shutdown.md)).
- **`app.inject(options)`** — simulates an HTTP request against the app
  in-process, with no real socket or network involved. This is what makes
  Fastify tests fast (see [22-testing.md](22-testing.md)); it works because
  the instance is the same whether or not `listen()` was ever called.

## Simple example

```typescript
const app = Fastify({ logger: true });

app.get('/', async () => ({ hello: 'world' }));

// Option A: start a real server
await app.listen({ port: 3000, host: '0.0.0.0' });

// Option B: test without a real port
const response = await app.inject({ method: 'GET', url: '/' });
console.log(response.json()); // { hello: 'world' }
```

## Application example

[src/app.ts](../../src/app.ts) creates the instance with `Fastify({ logger: true })`
and returns it without calling `listen()`. [src/server.ts](../../src/server.ts)
imports that instance and is the only place that calls `app.listen()`. This
split (build vs. start) is what lets tests in Phase 7 call `buildApp()` and
use `app.inject()` directly, with no port binding at all.

## Important details

- Building the instance (`Fastify(...)`) and starting it (`listen()`) are
  separate steps on purpose — see the split above.
- `logger: true` is a shortcut for a default Pino logger; you can pass a full
  Pino config object instead (see [17-logging.md](17-logging.md)).
- `app.server` exposes the underlying Node `http.Server` if you ever need
  raw Node APIs (rare, and not used in this project).

## Common mistakes

- Calling `app.listen()` inside a module that's also imported by tests —
  this binds a real port as a side effect of importing the file, which is
  exactly why `buildApp()`/`server.ts` are kept separate here.
- Forgetting to `await app.listen(...)` (or its Promise) and assuming the
  server is already accepting traffic on the next line.
- Registering routes/plugins *after* calling `listen()` — always register
  everything first, then start listening.

## Best practices

- Export a `buildApp()` function that returns a fully configured, unstarted
  instance. Use it from both `server.ts` (production entry point) and your
  test files.
- Keep instance-level options (logger, body limits) in one place instead of
  scattered across the codebase.

## Express comparison

| | Express | Fastify |
|---|---|---|
| Create app | `const app = express()` | `const app = Fastify(options)` |
| Start server | `app.listen(port)` (returns `http.Server`) | `await app.listen({ port })` (returns a Promise) |
| Test without a port | Needs `supertest` wrapping the `http.Server` | Built-in `app.inject()`, no real socket |
| Config | Passed ad hoc via middleware | Passed once, as instance options |

## Interview questions

1. What is the Fastify instance and what is attached to it?
2. Why are `buildApp()` and `listen()` often kept in separate files?
3. What does `app.ready()` do, and when would you call it explicitly?
4. What is `app.inject()` and why is it faster than a real HTTP request in tests?

## Interview answer

> The Fastify instance, returned by calling `Fastify(options)`, is the root
> of the app — routes, hooks, plugins, and decorators all attach to it. It's
> deliberately separate from *starting* the server: `listen()` binds a real
> port, while `ready()` just waits for all plugins to finish booting, and
> `inject()` simulates a request in-process without any network involved at
> all. Splitting "build the app" from "start the app" into two functions is
> what lets the exact same instance be started for real traffic or exercised
> directly in tests.
