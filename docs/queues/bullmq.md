# BullMQ

## What is it?

A Redis-backed job queue library. A `Queue` (the producer) adds jobs; a
`Worker` (the consumer, usually a **separate process**) picks them up and
runs them, with built-in retry, backoff, and delay support.

```text
Appointment created
      ↓
   BullMQ
      ↓
Send notification (in a separate worker process)
```

## Why does this project use it?

Sending a notification shouldn't block the HTTP response for
`POST /appointments` — the client doesn't need to wait for an email/SMS
provider to answer before getting their `201 Created`. Queueing the work and
processing it elsewhere (this project's `npm run worker` process) decouples
"the appointment was created" from "the notification was sent," and gets
automatic retry for free if the notification step fails transiently.

## How it works

```typescript
// src/jobs/notification.queue.ts — the producer
export const notificationQueue = new Queue('notifications', {
  connection: createRedisConnection(),
});

export function enqueueAppointmentCreated(data: AppointmentCreatedJobData) {
  return notificationQueue.add('appointment-created', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
  });
}
```

```typescript
// src/modules/appointments/appointment.routes.ts — enqueued right after
// the appointment is actually committed, never from inside the transaction
await enqueueAppointmentCreated({
  appointmentId: appointment.id,
  userId: appointment.userId,
  serviceId: appointment.serviceId,
});
```

The consumer side is a **separate Node process** entirely — see
[workers.md](workers.md).

## A real, current TypeScript/ESM gotcha this project hit

`import IORedis from 'ioredis'` failed to compile under this project's
`NodeNext` module resolution:

```text
error TS2709: Cannot use namespace 'IORedis' as a type.
error TS2351: This expression is not constructable.
```

`ioredis` ships CJS-style type declarations (`export { default } from
"./Redis"`) with no `"exports"` map in its `package.json`, which doesn't
interact cleanly with `esModuleInterop` under `NodeNext` resolution in this
project's exact setup. The fix — confirmed to compile and run — was to use
the named export instead of the default:

```typescript
// Before (fails to compile here):
import IORedis from 'ioredis';
new IORedis(url, options);

// After (works):
import { Redis } from 'ioredis';
new Redis(url, options);
```

See [src/jobs/connection.ts](../../src/jobs/connection.ts). Worth knowing
this exists as a category of problem — a CJS package's type declarations
don't always interoperate perfectly with a strict ESM TypeScript project,
and the fix is often "use the named export" rather than anything wrong with
your own config.

## Why BullMQ needs its own Redis connection (not `app.redis`)

BullMQ's `Worker` waits for new jobs using Redis's **blocking** commands
internally, which is fundamentally incompatible with ioredis's default
retry behavior on a shared connection also being used for ordinary
request/response commands (like the app's caching reads in
`service.routes.ts`). BullMQ documents `maxRetriesPerRequest: null` as a
**requirement** for its connections. This project's
[src/jobs/connection.ts](../../src/jobs/connection.ts) creates a fresh,
dedicated connection for exactly this reason:

```typescript
export function createRedisConnection(): Redis {
  return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
}
```

— used once for the `Queue` (in `notification.queue.ts`) and once for the
`Worker` (in `notification.worker.ts`), never shared with `app.redis` or
with each other.

## Important details

- A `Queue` only *adds* jobs — it does nothing on its own until a `Worker`
  somewhere is actually consuming that same queue name (`'notifications'`).
  If no worker process is running, jobs simply accumulate in Redis.
- Job `data` should be small, serializable identifiers (`appointmentId`,
  `userId`) — not entire domain objects — since it's stored in Redis as JSON
  and doesn't automatically stay in sync with the database afterward.

## Common mistakes

- Enqueueing a job *inside* a still-open database transaction — if the
  transaction later rolls back, a worker could still have already picked up
  and processed a job referencing data that was never actually committed.
  This project enqueues only *after* `$transaction(...)` resolves.
- Sharing one ioredis connection between BullMQ and regular app-level Redis
  usage — works until it doesn't, under load, in confusing ways.
- Assuming a `Queue.add()` call executes the job — it only schedules it; a
  running `Worker` is what actually executes it.

## Best practices

- Run the worker as a separate process from the API (`npm run worker`,
  separate from `npm run dev`) — mirrors how this would be deployed as two
  separate containers in Phase 8.
- Give every queue connection `maxRetriesPerRequest: null` and its own
  dedicated ioredis instance.

## Express comparison

Not framework-specific — BullMQ's API is identical regardless of the web
framework enqueueing jobs. What's Fastify-specific here is only *where* the
enqueue call happens (inside a route handler, after `app.prisma.$transaction`
resolves) — the same pattern would look identical in an Express route.

## Interview questions

1. Why does creating an appointment enqueue a job instead of sending the
   notification synchronously in the same request?
2. Why do the Queue and Worker each need their own Redis connection instead
   of sharing `app.redis`?
3. Why does this project enqueue the notification job *after* the
   transaction resolves, not from inside it?
4. What TypeScript/ESM issue did this project hit importing `ioredis`, and
   what was the fix?

## Interview answer

> BullMQ decouples "the appointment was created" from "the notification was
> sent" — the API enqueues a small job (just IDs, not full objects) and
> returns immediately; a separate worker process consumes it, with built-in
> retry and backoff. BullMQ's Worker requires its own Redis connection with
> `maxRetriesPerRequest: null` due to its use of blocking commands, so it's
> never shared with the app's ordinary caching connection or even with the
> Queue's own connection — each gets a fresh one. Building this also
> surfaced a real TypeScript/ESM interop issue with `ioredis`'s default
> export under strict `NodeNext` resolution, fixed by importing its named
> `Redis` export instead.
