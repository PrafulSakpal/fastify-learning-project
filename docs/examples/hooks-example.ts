/**
 * Standalone example: two hook behaviors that trip people up —
 *   1. a hook that short-circuits the lifecycle by sending a reply
 *   2. onError, which runs only when something actually throws
 *
 * Run with:
 *   npx tsx docs/examples/hooks-example.ts
 *
 * See docs/fastify/08-hooks.md.
 */
import Fastify from 'fastify';

async function main() {
  const app = Fastify({ logger: false });

  // A route-scoped guard hook: if it sends a reply, the handler below never
  // runs. Scoped to this one route (via route options) so it doesn't affect
  // /boom below.
  app.route({
    method: 'GET',
    url: '/guarded',
    preHandler: async (request, reply) => {
      if (request.headers['x-api-key'] !== 'demo-key') {
        return reply.code(401).send({ message: 'missing or invalid x-api-key' });
      }
    },
    handler: async () => {
      console.log('handler ran'); // only logs when the guard passes
      return { secret: 42 };
    },
  });

  app.get('/boom', async () => {
    throw new Error('deliberate failure');
  });

  app.addHook('onError', async (request, reply, error) => {
    console.log('onError hook saw:', error.message);
  });

  console.log('--- without the header ---');
  const denied = await app.inject({ method: 'GET', url: '/guarded' });
  console.log(denied.statusCode, denied.json()); // 401, handler log line does NOT appear above

  console.log('--- with the header ---');
  const allowed = await app.inject({
    method: 'GET',
    url: '/guarded',
    headers: { 'x-api-key': 'demo-key' },
  });
  console.log(allowed.statusCode, allowed.json()); // 200, "handler ran" logs first

  console.log('--- triggering onError ---');
  const errored = await app.inject({ method: 'GET', url: '/boom' });
  console.log(errored.statusCode, errored.json());

  await app.close();
}

main();

/*
Expected output:

--- without the header ---
401 { message: 'missing or invalid x-api-key' }
--- with the header ---
handler ran
200 { secret: 42 }
--- triggering onError ---
onError hook saw: deliberate failure
500 { statusCode: 500, error: 'Internal Server Error', message: 'deliberate failure' }
(console.log may wrap this object across multiple lines depending on terminal width)
*/
