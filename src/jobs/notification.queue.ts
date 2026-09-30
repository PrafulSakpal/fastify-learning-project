import { Queue } from 'bullmq';
import { createRedisConnection } from './connection.js';

export const NOTIFICATION_QUEUE_NAME = 'notifications';

export interface AppointmentCreatedJobData {
  appointmentId: string;
  userId: string;
  serviceId: string;
}

export interface AppointmentReminderJobData {
  appointmentId: string;
  userId: string;
}

/**
 * The producer side — used by appointment.routes.ts. A separate Worker
 * process (src/worker.ts) consumes this same queue by name. See
 * docs/queues/bullmq.md and docs/queues/workers.md.
 */
export const notificationQueue = new Queue(NOTIFICATION_QUEUE_NAME, {
  connection: createRedisConnection(),
});

/**
 * "Appointment created" → BullMQ → send confirmation notification.
 * Configured with retries + exponential backoff — see docs/queues/retry.md.
 */
export function enqueueAppointmentCreated(data: AppointmentCreatedJobData) {
  return notificationQueue.add('appointment-created', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
  });
}

/**
 * A delayed job standing in for "remind the user N hours before their
 * appointment." Uses a short delay here so it's observable in a demo —
 * a real system would compute the delay from the appointment's date/time.
 * See docs/queues/delayed-jobs.md.
 */
export function enqueueAppointmentReminder(data: AppointmentReminderJobData, delayMs: number) {
  return notificationQueue.add('appointment-reminder', data, { delay: delayMs });
}
