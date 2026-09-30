import { Worker, type Job } from 'bullmq';
import pino from 'pino';
import { createRedisConnection } from './connection.js';
import { NOTIFICATION_QUEUE_NAME } from './notification.queue.js';
import type { AppointmentCreatedJobData, AppointmentReminderJobData } from './notification.queue.js';

const logger = pino({ name: 'notification-worker' });

async function processAppointmentCreated(job: Job<AppointmentCreatedJobData>) {
  // Artificial failure on the very first attempt, purely to demonstrate
  // BullMQ's retry/backoff behavior end to end (see docs/queues/retry.md).
  // A real notification job would instead fail here only when the actual
  // send (email/SMS/push) genuinely fails.
  if (job.attemptsMade === 0) {
    throw new Error('Simulated transient failure (demonstrates automatic retry)');
  }

  logger.info(
    { appointmentId: job.data.appointmentId, attempt: job.attemptsMade + 1 },
    'sending appointment confirmation notification',
  );
  // Stand-in for a real notification (email/SMS/push) — this project keeps
  // it simple and just logs, per its own no-over-engineering rule.
}

async function processAppointmentReminder(job: Job<AppointmentReminderJobData>) {
  logger.info({ appointmentId: job.data.appointmentId }, 'sending appointment reminder');
}

export function startNotificationWorker() {
  const worker = new Worker(
    NOTIFICATION_QUEUE_NAME,
    async (job) => {
      switch (job.name) {
        case 'appointment-created':
          return processAppointmentCreated(job as Job<AppointmentCreatedJobData>);
        case 'appointment-reminder':
          return processAppointmentReminder(job as Job<AppointmentReminderJobData>);
        default:
          logger.warn({ jobName: job.name }, 'unknown job name — skipping');
      }
    },
    { connection: createRedisConnection() },
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, name: job.name }, 'job completed');
  });

  worker.on('failed', (job, error) => {
    logger.error(
      { jobId: job?.id, name: job?.name, attemptsMade: job?.attemptsMade, error: error.message },
      'job failed',
    );
  });

  return worker;
}
