# WebSockets

## What is it?

A persistent, full-duplex connection between client and server — unlike a
normal HTTP request/response, either side can send messages at any time
without the other having to ask first. This project uses `@fastify/websocket`
(built on the `ws` library) for one real-time feature:

```text
Appointment status changed
         ↓
     WebSocket
         ↓
  Connected client(s)
```

## Why does Fastify have it?

Some events (an appointment being confirmed or cancelled) are naturally
push-based — a client watching an appointment shouldn't have to poll
`GET /appointments/:id` repeatedly to notice a change. `@fastify/websocket`
lets a route opt into the WebSocket protocol the same declarative way every
other route is defined, via a route option (`websocket: true`), rather than
a completely separate server/protocol stack.

## How it works

```typescript
// src/plugins/websocket.ts
await app.register(fastifyWebsocket);

const clients = new Set<WebSocket>();

app.decorate('broadcastAppointmentUpdate', function (payload: unknown) {
  const message = JSON.stringify(payload);
  for (const client of clients) {
    if (client.readyState === 1) client.send(message); // 1 === OPEN
  }
});

app.get('/ws/appointments', { websocket: true }, (socket, request) => {
  clients.add(socket);

  socket.on('message', (raw) => {
    if (raw.toString() === 'ping') socket.send('pong');
  });

  socket.on('close', () => clients.delete(socket));
  socket.on('error', (error) => {
    request.log.error(error, 'websocket connection error');
    clients.delete(socket);
  });
});
```

```typescript
// src/modules/appointments/appointment.routes.ts — after a status change
app.broadcastAppointmentUpdate({
  type: 'appointment.status_changed',
  appointmentId: appointment.id,
  status: appointment.status,
});
```

## Application example

Verified with a real WebSocket client connecting to the running app:

```text
client: connected
client sends: "ping"
client received: "pong"
                                    ← (meanwhile, PATCH /appointments/:id sets status: CONFIRMED)
client received: {"type":"appointment.status_changed","appointmentId":"...","status":"CONFIRMED"}
```

And the server's own logs show the connection lifecycle:

```json
{"reqId":"req-c","clients":1,"msg":"websocket client connected"}
{"reqId":"req-c","clients":0,"msg":"websocket client disconnected"}
```

The broadcast only fires from `PATCH /appointments/:id` when the update
actually includes a `status` field, and always from `DELETE /appointments/:id`
(cancel) — see [appointment.routes.ts](../../src/modules/appointments/appointment.routes.ts).

## Important details

- **Event handlers must be attached synchronously**, before any `await` in
  the handler — `@fastify/websocket`'s own docs are explicit about this: if
  you do async work (e.g., loading data) before calling `socket.on('message', ...)`,
  messages that arrive during that async work are silently dropped, since
  nothing was listening yet.
- **`readyState === 1` (OPEN)** is checked before every `send()` in the
  broadcast — a socket that's mid-close but not yet removed from the `Set`
  would otherwise throw or silently fail to deliver.
- **Closing connections**: the `close` event handler removes the socket from
  the tracked `Set` — without this, the set would grow forever and the
  broadcast loop would keep trying to message long-dead connections.
- **Authentication**: this route is deliberately **not** authenticated, to
  keep the demo simple — a browser's native `WebSocket` constructor can't
  set custom headers on the handshake request, so real-world token
  verification here typically means a token in the query string
  (`/ws/appointments?token=...`) verified manually with `app.jwt.verify()`
  inside the route, rather than reusing `app.authenticate` as a `preHandler`
  the way HTTP routes do. Left unimplemented here since this app's WebSocket
  feature is a status broadcast, not sensitive per-user data.
- **No cross-instance fan-out**: connected clients are tracked in a plain
  in-memory `Set`, so a broadcast only reaches clients connected to *this*
  process. Multiple app instances (Phase 8 territory) would need Redis
  pub/sub (or similar) to fan a broadcast out to every instance's own
  connected clients — a natural next step, not needed at this project's scale.

## Common mistakes

- Attaching `socket.on('message', ...)` after an `await` — messages that
  arrive in that window are lost.
- Forgetting to remove closed sockets from a tracked collection, leaking
  memory and eventually erroring on `send()` to dead connections.
- Broadcasting to every socket without checking `readyState`.

## Best practices

- Track connected sockets in a simple collection scoped to the plugin that
  owns them (this project's `clients` `Set`, private to `websocket.ts`) —
  don't reach for anything more complex until multi-instance fan-out is an
  actual requirement.
- Attach every event listener synchronously, before any `await`.
- Always handle `close` and `error` — a connection that never gets cleaned
  up from your tracking structure is a leak.

## Express comparison

Express has no built-in WebSocket support — a comparable app typically
attaches the `ws` library directly to the underlying `http.Server` alongside
Express, manually routing upgrade requests, since Express's routing layer
doesn't understand the WebSocket protocol at all. `@fastify/websocket`
integrates it into Fastify's own route declaration syntax instead.

## Interview questions

1. Why must WebSocket message handlers be attached synchronously?
2. Why isn't `/ws/appointments` authenticated in this project, and how
   would you add authentication to a WebSocket route in general?
3. What does checking `readyState` before `send()` protect against?
4. What's missing from this implementation that a multi-instance deployment
   would need?

## Interview answer

> `@fastify/websocket` lets a route opt into the WebSocket protocol via a
> route option (`websocket: true`), giving handler code direct access to the
> raw socket. This project tracks connected sockets in an in-memory `Set`
> and exposes a `broadcastAppointmentUpdate()` decorator that any module can
> call — used here when an appointment's status changes. Two details matter
> for correctness: event listeners must be attached synchronously (an `await`
> before `socket.on('message', ...)` risks silently dropping early messages),
> and closed/erroring sockets must be removed from the tracked set to avoid
> a memory leak and failed sends. This implementation is intentionally
> single-instance and unauthenticated to stay simple; a production version
> would add token verification (via query string, since the WebSocket
> handshake can't carry custom headers from a browser) and Redis pub/sub for
> fan-out across multiple app instances.
