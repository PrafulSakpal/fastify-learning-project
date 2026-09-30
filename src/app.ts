import Fastify, { type FastifyReply } from 'fastify';
import type { JsonSchemaToTsProvider } from '@fastify/type-provider-json-schema-to-ts';
import { appointmentRoutes } from './modules/appointments/appointment.routes.js';
import { userRoutes } from './modules/users/user.routes.js';
import { serviceRoutes } from './modules/services/service.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import requestTimingPlugin from './plugins/request-timing.js';
import errorHandlerPlugin from './plugins/error-handler.js';
import databasePlugin from './plugins/database.js';
import jwtPlugin from './plugins/jwt.js';
import redisPlugin from './plugins/redis.js';
import rateLimitPlugin from './plugins/rate-limit.js';
import websocketPlugin from './plugins/websocket.js';

/**
 * Builds (but does not start) a Fastify instance.
 * Kept separate from server.ts so tests can build an app with
 * `fastify.inject()` without binding to a real port (see Phase 7).
 */
export function buildApp() {
  // withTypeProvider<JsonSchemaToTsProvider>() makes every route's
  // request.params/query/body/response infer their TypeScript type directly
  // from the `as const` JSON Schema passed to that route — no manually
  // maintained interfaces that can drift out of sync with the schema.
  // See docs/fastify/13-json-schema.md.
  const app = Fastify({
    logger: true,
  }).withTypeProvider<JsonSchemaToTsProvider>();

  // fastify.decorate() — attaches a value directly to the instance itself.
  // See docs/fastify/12-decorators.md.
  app.decorate('appName', 'Fastify Appointment API');

  // fastify.decorateReply() — adds a reusable helper method to every `reply`.
  app.decorateReply('success', function (this: FastifyReply, data: unknown, code = 200) {
    return this.code(code).send({ success: true, data });
  });

  // Registered with fastify-plugin, so its hooks/handlers apply to every
  // route below, not just routes registered inside the plugin file itself.
  app.register(requestTimingPlugin);
  app.register(errorHandlerPlugin);
  app.register(databasePlugin);
  app.register(jwtPlugin);
  app.register(redisPlugin);
  app.register(rateLimitPlugin);
  app.register(websocketPlugin);

  app.get('/', async (request, reply) => {
    return reply.success({ message: `${app.appName} — Phase 6` });
  });

  app.register(userRoutes);
  app.register(serviceRoutes);
  app.register(appointmentRoutes);
  app.register(authRoutes);

  return app;
}
