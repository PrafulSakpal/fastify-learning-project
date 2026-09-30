# Retry

## What is it?

BullMQ's built-in mechanism for re-running a job automatically when its
processor throws, up to a configured number of `attempts`, with a `backoff`
delay between tries instead of retrying instantly in a tight loop.

## Why does this project use it?

Real notification delivery (an email/SMS/push provider) fails transiently
sometimes — a timeout, a momentary outage — for reasons that have nothing to
do with whether the notification *should* eventually succeed. Automatic
retry means a transient failure doesn't require any manual intervention or
custom retry logic in application code.

## How it works

```typescript
// src/jobs/notification.queue.ts
export function enqueueAppointmentCreated(data: AppointmentCreatedJobData) {
  return notificationQueue.add('appointment-created', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
  });
}
```

- `attempts: 3` — the job will run up to 3 times total before being marked
  permanently failed.
- `backoff: { type: 'exponential', delay: 1000 }` — waits 1s before the 2nd
  attempt, then longer before the 3rd, instead of retrying immediately.

Whether an attempt "fails" is entirely up to the processor: **throwing**
inside it tells BullMQ to retry (subject to `attempts`); returning
normally (even with no return value) tells BullMQ the job succeeded.

## Application example

This project's processor deliberately throws on the very first attempt,
purely to make retry behavior observable in a demo (a real notification job
would only throw when the actual send genuinely fails):

```typescript
// src/jobs/notification.worker.ts
async function processAppointmentCreated(job: Job<AppointmentCreatedJobData>) {
  if (job.attemptsMade === 0) {
    throw new Error('Simulated transient failure (demonstrates automatic retry)');
  }
  logger.info({ appointmentId: job.data.appointmentId }, 'sending appointment confirmation notification');
}
```

Verified, real worker log output from one appointment creation:

```json
{"jobId":"1","name":"appointment-created","attemptsMade":1,"error":"Simulated transient failure ...","msg":"job failed"}
{"appointmentId":"...","attempt":2,"msg":"sending appointment confirmation notification"}
{"jobId":"1","name":"appointment-created","msg":"job completed"}
```

Attempt 1 threw and failed; BullMQ waited (the exponential backoff delay),
tried again automatically with no application code involved in scheduling
that retry, and attempt 2 succeeded.

## Important details

- `job.attemptsMade` is the number of attempts *already made* before the
  current one — `0` on the very first run, `1` once a retry begins.
- Exceeding `attempts` marks the job permanently `failed` — BullMQ does not
  retry forever by default; a job can be inspected (e.g., via Bull Board, or
  `queue.getFailed()`) after that, but this project doesn't add any such
  tooling, keeping things simple.
- `backoff` avoids hammering a possibly-still-struggling external service
  immediately after a failure — exponential backoff specifically increases
  the wait between each successive retry.

## Common mistakes

- Setting `attempts` without a `backoff`, causing rapid-fire immediate
  retries that can make a transient problem worse (e.g., overwhelming an
  already-struggling downstream service).
- Throwing for *permanent* failures (e.g., invalid data that will never
  succeed no matter how many times it's retried) — wastes all configured
  attempts on something retrying can never fix.
- Assuming a returned (not thrown) rejection/error value counts as a
  failure — only a **thrown** error triggers BullMQ's retry logic.

## Best practices

- Only throw for genuinely transient conditions; validate/reject bad data
  without retrying (or with very few attempts) since retrying won't help.
- Choose `attempts` and `backoff` based on how long the operation is
  reasonable to keep retrying before it should be surfaced as a real
  failure needing attention.

## Express comparison

Not framework-specific — retry/backoff configuration is a BullMQ (and,
underneath, a Redis job-state) concept, identical regardless of which web
framework's routes are enqueueing jobs.

## Interview questions

1. What's the difference between a job's processor throwing vs. returning
   normally, from BullMQ's perspective?
2. What does `job.attemptsMade` represent, and why does this project check
   `=== 0` specifically?
3. Why use exponential backoff instead of retrying immediately?
4. What happens once a job exceeds its configured `attempts`?

## Interview answer

> BullMQ retries a job automatically when its processor throws, up to a
> configured `attempts` count, waiting a `backoff` delay between tries
> instead of retrying instantly. This project's demo processor deliberately
> throws only on the very first attempt (`job.attemptsMade === 0`) so the
> retry behavior is directly observable in the worker's logs — a real
> processor would only throw when an actual send genuinely fails, not on a
> fixed schedule. Once a job exceeds its configured attempts, it's marked
> permanently failed rather than retried indefinitely.
