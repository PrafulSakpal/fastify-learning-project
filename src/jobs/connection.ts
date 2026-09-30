import { Redis } from 'ioredis';
import { env } from '../config/env.js';

/**
 * BullMQ's Worker uses blocking Redis commands internally and therefore
 * requires `maxRetriesPerRequest: null` on its connection — ioredis's
 * default retry behavior is incompatible with how BullMQ waits for jobs.
 * Every Queue/Worker/QueueEvents gets its OWN connection from this factory
 * rather than sharing one instance (BullMQ's own recommendation) — and none
 * of these are the same connection as `app.redis` (used for caching and
 * rate-limiting), which has entirely different needs. See
 * docs/queues/bullmq.md.
 */
export function createRedisConnection(): Redis {
  return new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
  });
}
