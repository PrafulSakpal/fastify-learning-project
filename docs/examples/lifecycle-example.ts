/**
 * Standalone example: the full Fastify request lifecycle, every stage
 * logging when it runs. Run with:
 *
 *   npx tsx docs/examples/lifecycle-example.ts
 *
 * See docs/fastify/09-lifecycle.md for the full explanation.
 */
import Fastify from 'fastify';

async function main() {
  const app = Fastify({ logger: false });

  app.addHook('onRequest', async () => console.log('1. onRequest'));
  app.addHook('preParsing', async (_req, _reply, payload) => {
    console.log('2. preParsing');
    return payload;
  });
  app.addHook('preValidation', async () => console.log('3. preValidation'));
  app.addHook('preHandler', async () => console.log('4. preHandler'));
  app.addHook('preSerialization', async (_req, _reply, payload) => {
    console.log('6. preSerialization');
    return payload;
  });
  app.addHook('onSend', async (_req, _reply, payload) => {
    console.log('7. onSend');
    return payload;
  });
  app.addHook('onResponse', async () => console.log('8. onResponse'));

  app.get('/demo', async () => {
    console.log('5. handler');
    return { ok: true };
  });

  const response = await app.inject({ method: 'GET', url: '/demo' });
  console.log('--- response ---');
  console.log(response.statusCode, response.json());

  await app.close();
}

main();

/*
Expected output:

1. onRequest
2. preParsing
3. preValidation
4. preHandler
5. handler
6. preSerialization
7. onSend
8. onResponse
--- response ---
200 { ok: true }
*/
