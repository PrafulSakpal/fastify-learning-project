import fp from 'fastify-plugin';
import fastifyRedis from '@fastify/redis';
import type { FastifyInstance } from 'fastify';
import { env } from '../config/env.js';

/**
 * Registers @fastify/redis, decorating `app.redis` with a ready-to-use
 * ioredis client — used for response caching (services.routes.ts) and as
 * the persistent store for @fastify/rate-limit (see app.ts). This is a
 * *separate* connection from the ones BullMQ creates for its queue/worker —
 * see docs/queues/bullmq.md for why those must not be shared.
 */
async function redisPlugin(app: FastifyInstance) {
  app.register(fastifyRedis, {
    url: env.REDIS_URL,
  });
}

export default fp(redisPlugin, { name: 'redis' });
