import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';

/**
 * A generous global default (rarely hit in normal use), with a much
 * stricter override on POST /auth/login (see auth.routes.ts's `config.rateLimit`
 * — the same route `config` option introduced in Phase 2, put to real use).
 * Backed by Redis (`app.redis`, registered just before this plugin in
 * app.ts) instead of the default in-memory store, so counts survive a
 * server restart and would be shared correctly across multiple app
 * instances. See docs/redis/rate-limiting.md.
 */
async function rateLimitPlugin(app: FastifyInstance) {
  app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    redis: app.redis,
  });
}

export default fp(rateLimitPlugin, { name: 'rate-limit', dependencies: ['redis'] });
