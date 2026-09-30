import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';

/**
 * Adds a per-request timer and an `x-response-time-ms` header to every
 * response in the app.
 *
 * Wrapped in fastify-plugin (`fp`) on purpose: a plugin registered the
 * normal way gets its own encapsulated context, so hooks/decorators it adds
 * would NOT be visible to sibling plugins like appointmentRoutes. `fp()`
 * tells Fastify "skip encapsulation for this plugin — attach directly to
 * the parent instead," which is what makes this timing hook apply globally.
 * See docs/fastify/11-encapsulation.md and docs/fastify/10-plugins.md.
 */
async function requestTimingPlugin(app: FastifyInstance) {
  app.decorateRequest('startTime', 0);

  // Lifecycle: onRequest runs first, before routing/parsing/validation.
  app.addHook('onRequest', async (request) => {
    request.startTime = Date.now();
  });

  // onSend runs after the handler, but before the response is flushed —
  // this is the last point at which headers can still be modified.
  app.addHook('onSend', async (request, reply, payload) => {
    const elapsedMs = Date.now() - request.startTime;
    reply.header('x-response-time-ms', elapsedMs.toString());
    return payload;
  });

  // onResponse runs after the response has already been sent — headers can
  // no longer be changed here, so it's used for logging/metrics only. Note
  // this is a *second*, custom log line — Fastify's own built-in request
  // logging (from `logger: true`) already emits one "request completed"
  // line per request; this hook is only here to show onResponse firing.
  app.addHook('onResponse', async (request, reply) => {
    request.log.info(
      { url: request.url, statusCode: reply.statusCode, responseTime: reply.elapsedTime },
      'custom onResponse hook fired',
    );
  });
}

export default fp(requestTimingPlugin, {
  name: 'request-timing',
});
