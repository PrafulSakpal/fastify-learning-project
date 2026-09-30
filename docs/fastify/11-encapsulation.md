# Encapsulation

## What is it?

The rule that governs *where* a hook, decorator, or plugin is visible.
Every call to `app.register()` creates a new child context that inherits
everything from its parent, but nothing added to the child is visible back
up to the parent or across to sibling contexts.

## Why does Fastify have it?

Without this rule, every hook and decorator in a large app would be global —
exactly the problem with an Express app where any middleware registered
anywhere with `app.use()` can affect any route. Encapsulation means a
resource module (like `appointments`) can freely add its own hooks and
decorators without needing to worry about accidentally affecting `users` or
`services` modules registered elsewhere.

## How does it work?

```text
Root app (src/app.ts)
 │
 ├── requestTimingPlugin  (registered with fastify-plugin → NOT encapsulated,
 │                          attaches directly to Root)
 │
 └── appointmentRoutes     (plain plugin → encapsulated child of Root)
       │
       ├── preHandler hook  (visible to everything in this box and below)
       ├── GET /appointments
       ├── GET /appointments/:id
       ├── POST /appointments
       │
       └── appointmentStatsRoutes  (plain plugin → encapsulated child of
             │                       appointmentRoutes)
             ├── preHandler hook  (visible ONLY here)
             └── GET /appointments/stats/summary
```

The rule, walking this tree:

- `GET /` (registered directly on Root) never runs the `appointmentRoutes`
  preHandler — it's a sibling, not a descendant.
- `GET /appointments/stats/summary` runs **both** preHandlers: its own child
  hook, and its parent's (`appointmentRoutes`) hook — children inherit
  everything from their ancestors.
- The `request-timing` hooks run everywhere, because `fp()` explicitly
  opted out of encapsulation and attached to Root directly.

## Simple example

```typescript
app.register(async function pluginA(child) {
  child.decorate('secret', 'A');
  child.get('/a', async (req) => ({ secret: req.server.secret }));
});

app.register(async function pluginB(child) {
  // child.secret does NOT exist here — pluginB never saw pluginA's decorator
  child.get('/b', async () => ({ ok: true }));
});
```

## Application example

This project's real, observed proof — three different requests, taken from
an actual run of `npm run dev` (see [08-hooks.md](08-hooks.md) for the hooks
involved):

```text
GET /                          → no "accessing appointments module" log at all
GET /appointments               → "accessing appointments module" (parent hook only)
GET /appointments/stats/summary → "accessing appointments module"          (inherited from parent)
                                  "accessing appointment stats (child scope)" (own hook)
```

This is the encapsulation tree in [appointment.routes.ts](../../src/modules/appointments/appointment.routes.ts)
made visible through logs: the root route is a total stranger to the
appointments plugin's hook; the stats route is a descendant of it and
inherits it, plus adds its own.

## Important details

- Encapsulation applies to **hooks, decorators, and routes** — anything
  attached via `app.addHook`, `app.decorate*`, or route registration inside
  a plugin function.
- A child always sees its ancestors' additions; the reverse is never true.
- `fastify-plugin` is the *only* standard way to intentionally break this
  boundary — there's no equivalent of Express's implicit global `app.use()`.

## Common mistakes

- Expecting a decorator added in one plugin to be visible in a sibling
  plugin — it won't be, unless the first plugin used `fastify-plugin`.
- "Fixing" a missing decorator by moving code into the root `app.ts` file
  instead of using `fastify-plugin` — this works but throws away the benefit
  of keeping the plugin's setup code in its own file.
- Assuming encapsulation only applies to routes — it applies equally to
  hooks and decorators, which is easy to forget when debugging "why does
  `request.user` not exist here."

## Best practices

- Let encapsulation be the default; only escape it with `fastify-plugin`
  for genuinely cross-cutting concerns (see [10-plugins.md](10-plugins.md)).
- Use nested `register()` calls (parent/child plugins) to scope a hook to
  "this resource and its sub-routes" without affecting the rest of the app —
  exactly what `appointmentStatsRoutes` demonstrates.

## Express comparison

Express has no equivalent concept — every `app.use()` and every property set
on `req`/`res` is visible everywhere, for the lifetime of the app. There is
no built-in way to scope a piece of middleware to "this router and its
children only" without manually re-mounting routers and being careful about
what you attach where.

## Interview questions

1. What does "encapsulation" mean in Fastify, specifically?
2. If plugin A decorates the instance and plugin B is a sibling, can B see that decorator? Why or why not?
3. How does a nested plugin (child of a child) relate to its ancestors' hooks and decorators?
4. What's the one standard way to intentionally break encapsulation, and when is it appropriate?

## Interview answer

> Encapsulation means every `app.register()` call creates a new child scope
> that inherits everything from its parent but shares nothing with its
> siblings or back up to its parent. Hooks, decorators, and routes added
> inside a plugin are only visible to that plugin and anything registered
> inside it. This is what lets independent resource modules coexist safely
> in one app. The one standard way to opt out is `fastify-plugin`, which
> attaches a plugin's contents directly to its parent scope instead of
> giving it its own — appropriate for infrastructure-level concerns like a
> shared database client or a global logging hook, not for ordinary
> feature modules.
