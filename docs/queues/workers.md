# Workers

## What is it?

The consumer half of BullMQ: a `Worker` attaches to a named queue and runs a
processor function for every job added to it. In this project, the worker
runs as a **separate Node process** from the Fastify API.

## Why a separate process?

The API process's job is to answer HTTP requests fast. A notification job
might take anywhere from milliseconds to seconds (a real email/SMS provider
call would be slower and less predictable than this demo's `console`/logger
call). Running the worker separately means a slow or failing job never
blocks or crashes the API, and either process can be scaled, restarted, or
deployed independently — exactly the "Fastify / PostgreSQL / Redis / Worker"
split this project's docs describe for Phase 8's Docker setup.

## How it works

```typescript
// src/jobs/notification.worker.ts
export function startNotificationWorker() {
  const worker = new Worker(
    NOTIFICATION_QUEUE_NAME,
    async (job) => {
      switch (job.name) {
        case 'appointment-created':
          return processAppointmentCreated(job);
        case 'appointment-reminder':
          return processAppointmentReminder(job);
      }
    },
    { connection: createRedisConnection() },
  );

  worker.on('completed', (job) => { /* log */ });
  worker.on('failed', (job, error) => { /* log */ });

  return worker;
}
```

```typescript
// src/worker.ts — the actual entry point, run with `npm run worker`
const worker = startNotificationWorker();

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
```

## Application example

Running `npm run worker` alongside `npm run dev` and creating an
appointment produces, in the **worker's own log** (not the API's):

```json
{"name":"notification-worker","jobId":"1","name":"appointment-created","attemptsMade":1,"error":"Simulated transient failure ...","msg":"job failed"}
{"name":"notification-worker","appointmentId":"...","attempt":2,"msg":"sending appointment confirmation notification"}
{"name":"notification-worker","jobId":"1","name":"appointment-created","msg":"job completed"}
```

Two completely separate processes, two separate log streams, connected only
through Redis — the API never directly calls anything in the worker.

## Important details

- **One processor function, dispatching on `job.name`.** A single `Worker`
  per queue is normal — it doesn't mean "one job type," it means "one
  listener for this queue," which then routes to different logic per job
  name (`appointment-created` vs. `appointment-reminder` here).
- **`worker.close()` on shutdown** (in `src/worker.ts`'s `SIGTERM`/`SIGINT`
  handlers) lets any in-flight job finish before the process actually exits
  — a small preview of the graceful shutdown concept covered fully in
  [25-graceful-shutdown.md](../fastify/25-graceful-shutdown.md) (Phase 8).
- If no worker process is running, `Queue.add()` calls still succeed —
  Redis holds the jobs until a worker eventually starts and drains them.

## Common mistakes

- Running job-processing logic directly inside the API process "for
  simplicity" — works for a demo, but reintroduces the exact coupling
  (slow/failing job blocks/crashes API request handling) queues exist to
  avoid.
- Forgetting to actually run `npm run worker` and being confused why jobs
  never seem to complete — they're just waiting in Redis for a consumer.
- Not calling `worker.close()` on shutdown, risking a job being killed
  mid-processing.

## Best practices

- Keep the worker's entry point minimal — its only job is to start the
  worker(s) and handle process signals cleanly.
- Log job lifecycle events (`completed`, `failed`) from the worker, not just
  inside each processor function, so every job's outcome is visible even if
  a processor forgets to log it itself.

## Express comparison

Not framework-specific — nothing about a BullMQ worker process depends on
the web framework used by its corresponding API. The same `src/worker.ts`
here would be unchanged next to an Express app instead of Fastify.

## Interview questions

1. Why does this project run the worker as a separate process instead of
   in the same process as the Fastify server?
2. What happens to enqueued jobs if no worker process is running?
3. How does a single `Worker` instance handle more than one kind of job?
4. What does `worker.close()` protect against on shutdown?

## Interview answer

> A BullMQ `Worker` is the consumer side of a queue, and this project runs
> it as a completely separate process (`npm run worker`) from the Fastify
> API — connected only through Redis, never through direct function calls.
> This means a slow or failing notification never blocks or crashes request
> handling, and the two processes can be deployed, scaled, and restarted
> independently, mirroring how they'd run as separate containers in
> production. One `Worker` per queue routes to different logic based on
> `job.name`, and calling `close()` on shutdown lets any in-flight job
> finish before the process exits.
