import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import type { FastifyInstance } from 'fastify';
import { env } from '../config/env.js';

/**
 * Registers @fastify/jwt (adds app.jwt.sign/verify and request.jwtVerify())
 * and decorates `app.authenticate` — a reusable preHandler any route can opt
 * into with `preHandler: [app.authenticate]`. Wrapped in fastify-plugin so
 * both are visible to every module, not just this file. See
 * docs/fastify/20-jwt.md.
 */
async function jwtPlugin(app: FastifyInstance) {
  app.register(fastifyJwt, {
    secret: env.JWT_SECRET,
  });

  app.decorate('authenticate', async function (request, reply) {
    // Throws a real FastifyError (missing/expired/invalid token) with its
    // own correct 401 statusCode — caught by the `statusCode < 500`
    // passthrough branch in error-handler.ts (see docs/fastify/16-error-handling.md),
    // the same branch Phase 3's Content-Type bug fix added.
    await request.jwtVerify();
  });
}

export default fp(jwtPlugin, { name: 'jwt' });
