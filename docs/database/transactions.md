# Transactions

## What is it?

A way to group multiple database operations so they either **all** succeed
or **all** fail together — Prisma's `$transaction()`, in its "interactive"
form (`prisma.$transaction(async (tx) => { ... })`), where `tx` is a
transaction-scoped client used in place of `prisma` for every statement that
must be atomic.

## Why does this project use it?

Creating an appointment needs to check that both the referenced `userId` and
`serviceId` actually exist before inserting the row — two reads and a write
that should be treated as one unit against a *consistent* view of the
database.

## How it works

```typescript
const appointment = await app.prisma.$transaction(async (tx) => {
  const [user, service] = await Promise.all([
    tx.user.findUnique({ where: { id: userId } }),
    tx.service.findUnique({ where: { id: serviceId } }),
  ]);

  if (!user) throw AppError.notFound('User not found', 'USER_NOT_FOUND');
  if (!service) throw AppError.notFound('Service not found', 'SERVICE_NOT_FOUND');

  return tx.appointment.create({
    data: { userId, serviceId, date: new Date(date), startTime, endTime },
  });
});
```

If either `throw` fires, Prisma automatically rolls back the transaction —
in this case there's nothing to roll back yet (the `create` never ran), but
the pattern is identical for any future addition of a write *before* the
final step (e.g. decrementing some kind of quota).

## Application example

This is the actual, only `$transaction` call in this project:
[appointment.routes.ts](../../src/modules/appointments/appointment.routes.ts),
in the `POST /appointments` handler. Verified against the running app —
referencing a nonexistent user rolls back cleanly with no orphaned data and
a clear error:

```bash
curl -X POST http://localhost:3000/appointments -H "Content-Type: application/json" \
  -d '{"userId":"00000000-0000-0000-0000-000000000000","serviceId":"<real-id>", ...}'
# {"success":false,"error":{"code":"USER_NOT_FOUND","message":"User not found"}}
```

## An honest note on what this transaction does and doesn't protect against

This route also relies on a **database-enforced unique constraint**,
`@@unique([serviceId, date, startTime])` in
[schema.prisma](../../prisma/schema.prisma), to prevent double-booking the
same service at the same date/time — verified directly: booking the same
slot twice returns a `409` from Postgres itself (surfaced as Prisma's
`P2002`), not from any check inside the `$transaction` block above:

```bash
# second identical booking:
# {"success":false,"error":{"code":"DUPLICATE_RECORD",
#   "message":"A record violating the \"Appointment_serviceId_date_startTime_key\" constraint already exists"}}
```

Why the `$transaction` block doesn't *also* need to prevent this: a
check-then-insert pattern (`find` the slot, then `create` if free) inside a
transaction reduces the race window but, at Postgres's default `READ
COMMITTED` isolation level, doesn't fully eliminate it under concurrent
requests — two transactions can both read "no conflict" before either
commits. The **unique constraint** is what actually guarantees correctness
regardless of timing, by rejecting the second insert at the database level
no matter how the two requests interleave. The lesson: reach for a
transaction to group related operations atomically, but reach for a real
database constraint when the requirement is "this can never happen twice" —
they solve different problems, and this route benefits from both.

## Important details

- `$transaction(async (tx) => {...})` (the **interactive** form, used here)
  lets you branch on read results before deciding what to write — the form
  needed whenever a later statement depends on an earlier one's result, as
  here.
- Prisma also has a simpler **sequential/array form**,
  `$transaction([opA, opB])`, for when every operation is already known
  upfront and none depend on each other's results — not needed by anything
  in this app today, but useful to recognize.
- All queries against `tx` inside the callback run on the **same** database
  connection/transaction — mixing in a call to the outer `app.prisma` client
  (not `tx`) inside the callback would run outside the transaction entirely,
  defeating the point.

## Common mistakes

- Calling `app.prisma.x` instead of `tx.x` inside a `$transaction` callback —
  easy typo, and it silently breaks atomicity instead of throwing.
- Assuming a transaction alone prevents a race condition that a unique
  constraint is actually responsible for preventing (see above) — verify
  which layer is actually doing the guaranteeing.
- Wrapping trivial, single-statement operations in `$transaction` for no
  reason — a single Prisma call is already atomic on its own.

## Best practices

- Use an interactive transaction whenever a write depends on a prior read
  within the same operation.
- Still add a real database constraint (unique index, foreign key) for
  anything that must be impossible, rather than relying on application-level
  check-then-act logic alone.

## Express comparison

Not framework-specific — `$transaction` is a Prisma API, identical whether
called from an Express or a Fastify route handler. What differs is where
the call naturally lives: this project keeps it inside the route handler
itself (see [project-structure.md](../architecture/project-structure.md)'s
"keep database code separate from Fastify route handlers" — a thin enough
operation here that the transaction call *is* the "database code," with
nothing to usefully separate it from).

## Interview questions

1. What does Prisma's interactive `$transaction` form let you do that the
   array form doesn't?
2. In this project, what actually prevents double-booking the same
   service/date/time — the transaction, or something else? Why?
3. What happens if you accidentally call `app.prisma.x` instead of `tx.x`
   inside a transaction callback?
4. Why doesn't a check-then-insert transaction fully eliminate a race
   condition at the default isolation level?

## Interview answer

> Prisma's interactive `$transaction(async (tx) => {...})` groups several
> operations — here, verifying a user and a service both exist before
> creating an appointment — so they either all succeed or all roll back
> together, using `tx` in place of the regular client for every statement
> that must share the same transaction. But the transaction isn't what
> prevents double-booking in this app — a `@@unique` database constraint is,
> since a check-then-insert transaction alone doesn't fully close the race
> window at Postgres's default isolation level. The right tool depends on
> the requirement: transactions for atomicity across related operations,
> real constraints for guarantees that must hold no matter how concurrent
> requests interleave.
