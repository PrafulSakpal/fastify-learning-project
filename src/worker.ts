import pino from 'pino';
import { startNotificationWorker } from './jobs/notification.worker.js';

/**
 * A separate process from the Fastify API (run with `npm run worker`) —
 * exactly the "Fastify / PostgreSQL / Redis / Worker" split described in
 * docs/deployment (Phase 8). The API enqueues jobs; this process is the
 * only thing that ever consumes them. See docs/queues/workers.md.
 */
const logger = pino({ name: 'worker-process' });

const worker = startNotificationWorker();

logger.info('notification worker started');

async function shutdown(signal: string) {
  logger.info({ signal }, 'worker shutting down');
  await worker.close();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
