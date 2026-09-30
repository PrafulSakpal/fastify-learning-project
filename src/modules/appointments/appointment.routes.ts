import type { FastifyPluginAsyncJsonSchemaToTs } from '@fastify/type-provider-json-schema-to-ts';
import type { Appointment } from '@prisma/client';
import { AppError } from '../../common/errors/app-error.js';
import {
  enqueueAppointmentCreated,
  enqueueAppointmentReminder,
} from '../../jobs/notification.queue.js';
import {
  cancelAppointmentSchema,
  createAppointmentSchema,
  getAppointmentSchema,
  listAppointmentsSchema,
  appointmentStatsSchema,
  updateAppointmentSchema,
} from './appointment.schemas.js';

const DEMO_REMINDER_DELAY_MS = 10_000; // stands in for "24h before the appointment"

/**
 * Prisma's `date` column is `@db.Date` (no time component), so it round-trips
 * as a UTC-midnight `Date` object — `.toISOString().slice(0, 10)` reliably
 * recovers the plain "YYYY-MM-DD" string regardless of server timezone.
 * `createdAt`/`updatedAt` need the same Date → string conversion as the
 * other modules. See docs/database/prisma.md.
 */
function toAppointmentResponse(appointment: Appointment) {
  return {
    ...appointment,
    date: appointment.date.toISOString().slice(0, 10),
    createdAt: appointment.createdAt.toISOString(),
    updatedAt: appointment.updatedAt.toISOString(),
  };
}

export const appointmentRoutes: FastifyPluginAsyncJsonSchemaToTs = async (app) => {
  // Encapsulation: this hook is added to `app`, which — inside this plugin
  // function — refers to an encapsulated child of the root instance. It runs
  // for every route in THIS file (and any nested child registered below),
  // but never for sibling plugins. See docs/fastify/11-encapsulation.md.
  app.addHook('preHandler', async (request) => {
    request.log.info({ url: request.url }, 'accessing appointments module');
  });

  // GET /appointments
  app.get('/appointments', { schema: listAppointmentsSchema }, async (request, reply) => {
    const { status, page, limit } = request.query;

    const appointments = await app.prisma.appointment.findMany({
      where: status ? { status } : undefined,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { date: 'asc' },
    });

    return reply.code(200).send(appointments.map(toAppointmentResponse));
  });

  // GET /appointments/:id
  app.get('/appointments/:id', { schema: getAppointmentSchema }, async (request, reply) => {
    const appointment = await app.prisma.appointment.findUnique({
      where: { id: request.params.id },
    });

    if (!appointment) {
      throw AppError.notFound('Appointment not found', 'APPOINTMENT_NOT_FOUND');
    }

    return reply.code(200).send(toAppointmentResponse(appointment));
  });

  // POST /appointments — an interactive transaction: verifying the user and
  // service both exist, then creating the appointment, all against the same
  // transactional connection. See docs/database/transactions.md for why
  // this specific route is the one that uses $transaction, and what it does
  // and doesn't protect against (the real double-booking guard is the
  // @@unique([serviceId, date, startTime]) constraint in schema.prisma,
  // enforced by Postgres itself and surfaced here as a 409 via Prisma's P2002).
  app.route({
    method: 'POST',
    url: '/appointments',
    schema: createAppointmentSchema,
    handler: async (request, reply) => {
      const { userId, serviceId, date, startTime, endTime } = request.body;

      const appointment = await app.prisma.$transaction(async (tx) => {
        const [user, service] = await Promise.all([
          tx.user.findUnique({ where: { id: userId } }),
          tx.service.findUnique({ where: { id: serviceId } }),
        ]);

        if (!user) {
          throw AppError.notFound('User not found', 'USER_NOT_FOUND');
        }
        if (!service) {
          throw AppError.notFound('Service not found', 'SERVICE_NOT_FOUND');
        }

        return tx.appointment.create({
          data: { userId, serviceId, date: new Date(date), startTime, endTime },
        });
      });

      // "Appointment created" → BullMQ → send notification (see
      // docs/queues/bullmq.md). Enqueued *after* the transaction commits —
      // never enqueue a job from inside a still-open transaction, since a
      // worker could pick it up before (or despite) a later rollback.
      await enqueueAppointmentCreated({
        appointmentId: appointment.id,
        userId: appointment.userId,
        serviceId: appointment.serviceId,
      });
      await enqueueAppointmentReminder(
        { appointmentId: appointment.id, userId: appointment.userId },
        DEMO_REMINDER_DELAY_MS,
      );

      return reply.code(201).send(toAppointmentResponse(appointment));
    },
  });

  // PATCH /appointments/:id — partial update (date/time/status only; see
  // updateAppointmentBodySchema — reassigning userId/serviceId is out of
  // scope for this simple app).
  app.patch('/appointments/:id', { schema: updateAppointmentSchema }, async (request, reply) => {
    // minProperties: 1 in the schema already guarantees request.body isn't
    // empty — no manual check needed (see docs/fastify/14-validation.md).
    //
    // Prisma throws P2025 if the id doesn't exist, and P2002 if the update
    // collides with the unique (serviceId, date, startTime) constraint —
    // both mapped by the global error handler.
    const appointment = await app.prisma.appointment.update({
      where: { id: request.params.id },
      data: request.body,
    });

    // "Appointment status changed" → WebSocket → connected clients. Only
    // fires when this PATCH actually included a status change — updating
    // just the date/time isn't the event this broadcast represents. See
    // docs/fastify/21-websockets.md.
    if (request.body.status) {
      app.broadcastAppointmentUpdate({
        type: 'appointment.status_changed',
        appointmentId: appointment.id,
        status: appointment.status,
      });
    }

    return reply.code(200).send(toAppointmentResponse(appointment));
  });

  // DELETE /appointments/:id — "cancel", not a hard delete: matches the
  // business rule (Cancel appointments) and the CANCELLED status value.
  app.delete('/appointments/:id', { schema: cancelAppointmentSchema }, async (request, reply) => {
    const appointment = await app.prisma.appointment.update({
      where: { id: request.params.id },
      data: { status: 'CANCELLED' },
    });

    app.broadcastAppointmentUpdate({
      type: 'appointment.status_changed',
      appointmentId: appointment.id,
      status: appointment.status,
    });

    return reply.code(200).send(toAppointmentResponse(appointment));
  });

  // A nested child plugin — demonstrates the encapsulation tree in practice:
  // Parent (appointmentRoutes) → Child (appointmentStatsRoutes). See
  // docs/fastify/11-encapsulation.md.
  app.register(async function appointmentStatsRoutes(child) {
    child.addHook('preHandler', async (request) => {
      request.log.info('accessing appointment stats (child scope)');
    });

    child.get(
      '/appointments/stats/summary',
      { schema: appointmentStatsSchema },
      async (_request, reply) => {
        const counts = await app.prisma.appointment.groupBy({
          by: ['status'],
          _count: { status: true },
        });

        const summary = counts.reduce<Record<string, number>>((acc, row) => {
          acc[row.status] = row._count.status;
          return acc;
        }, {});

        return reply.code(200).send(summary);
      },
    );
  });
};
