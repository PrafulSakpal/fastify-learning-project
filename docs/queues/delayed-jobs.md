# Delayed Jobs

## What is it?

A job added with a `delay` option that a `Worker` won't pick up until that
many milliseconds have passed — scheduling work for the future without
needing a separate cron/scheduler system.

## Why does this project use it?

"Remind the user before their appointment" is naturally a future-scheduled
action, not something to do immediately when the appointment is created.
BullMQ's `delay` lets the API enqueue that reminder *at creation time*,
while the actual send happens whenever the delay elapses — no separate
polling job needed to notice "which appointments need a reminder soon."

## How it works

```typescript
// src/jobs/notification.queue.ts
export function enqueueAppointmentReminder(data: AppointmentReminderJobData, delayMs: number) {
  return notificationQueue.add('appointment-reminder', data, { delay: delayMs });
}
```

```typescript
// src/modules/appointments/appointment.routes.ts
const DEMO_REMINDER_DELAY_MS = 10_000; // stands in for "24h before the appointment"

await enqueueAppointmentReminder(
  { appointmentId: appointment.id, userId: appointment.userId },
  DEMO_REMINDER_DELAY_MS,
);
```

A 10-second delay is used here purely so the effect is observable in a demo
— a real system would compute the delay from
`appointment.date + appointment.startTime` minus some lead time (e.g.,
24 hours before), clamped to never be negative for an appointment booked
last-minute.

## Application example

Verified: creating an appointment immediately enqueues both jobs, but the
reminder only executes roughly 10 seconds later, per the worker's own log
timestamps:

```json
{"time":1790672333050, "msg":"job completed"}                              ← appointment-created (immediate, after its 1 retry)
{"time":1790672341962, "appointmentId":"...", "msg":"sending appointment reminder"}  ← appointment-reminder, ~9s later
{"time":1790672341964, "msg":"job completed"}
```

## Important details

- A delayed job still goes through the normal `attempts`/`backoff` retry
  logic (see [retry.md](retry.md)) once its delay elapses and it actually
  runs — delay only affects *when* it starts, not whether it can retry.
- The delay is tracked by BullMQ/Redis, not by the API process staying
  alive — the API can enqueue the job and move on (or even restart) long
  before the delay elapses; a running worker is all that's needed at the
  time the delay actually expires.
- A cancelled appointment in this demo does **not** cancel its pending
  reminder job — a real system would look up and remove the job (BullMQ
  supports this via a stored job ID) when an appointment is cancelled. Left
  out here deliberately to avoid over-engineering a demo reminder feature;
  worth knowing as a real gap if this pattern were used for something that
  actually mattered.

## Common mistakes

- Assuming a delayed job is guaranteed to run at *exactly* the delay time —
  it becomes eligible to run at that time, but actual execution depends on
  a worker being available and free.
- Not tracking/cancelling a delayed job when the underlying reason for it no
  longer applies (like this project's appointment-cancellation gap, called
  out above) — leads to jobs running for state that no longer makes sense.

## Best practices

- Use delayed jobs instead of a separate polling/cron process for anything
  that's naturally "do X at (or after) some future point," when the
  triggering event is already known at creation time.
- Track a delayed job's ID if there's a realistic chance you'll need to
  cancel it before it runs.

## Express comparison

Not framework-specific — delayed jobs are a BullMQ/Redis concept, identical
regardless of which framework's route enqueued the job.

## Interview questions

1. What does the `delay` option actually control, and what does it not
   guarantee?
2. Why is a delayed job a better fit here than a separate cron job scanning
   for "appointments needing a reminder soon"?
3. What real gap does this project's reminder implementation have, and why
   was it left as-is?
4. Does a delayed job skip retry logic once it starts running?

## Interview answer

> A delayed job is added immediately but only becomes eligible for a worker
> to pick up after its `delay` elapses — useful for "schedule this for
> later" without a separate cron/polling system, since BullMQ and Redis
> track the delay, not the API process. This project uses it for an
> appointment reminder, enqueued at creation time with a short demo delay
> standing in for a real "24 hours before" calculation. Once a delayed job's
> delay elapses, it goes through the same retry/backoff logic as any other
> job. A known, deliberately-left gap: cancelling an appointment doesn't
> cancel its already-enqueued reminder job — a real system would track and
> remove it, left out here to avoid over-building a demo feature.
