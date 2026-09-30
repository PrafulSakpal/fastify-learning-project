/**
 * Standalone example: the three decorator kinds, plus what Fastify v5 does
 * when you try the classic v4-era bug — defaulting decorateRequest to an
 * object literal instead of a primitive.
 *
 * Run with:
 *   npx tsx docs/examples/decorator-example.ts
 *
 * See docs/fastify/12-decorators.md.
 */
import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    appVersion: string;
  }
  interface FastifyRequest {
    // The correct way: a primitive default.
    requestNumber: number;
    // The fixed way: no default at all — assigned per-request in a hook.
    fixedState: { count: number };
  }
  interface FastifyReply {
    success(data: unknown): FastifyReply;
  }
}

let counter = 0;

async function goodApp() {
  const app = Fastify({ logger: false });

  app.decorate('appVersion', '1.0.0'); // instance decorator
  app.decorateRequest('requestNumber', 0); // primitive default — safe
  app.decorateReply('success', function (this: FastifyReply, data: unknown) {
    return this.send({ success: true, data });
  });

  app.addHook('onRequest', async (request) => {
    counter += 1;
    request.requestNumber = counter; // each request gets its OWN value
  });

  app.get('/x', async (request, reply) => {
    return reply.success({ version: app.appVersion, requestNumber: request.requestNumber });
  });

  const first = await app.inject({ method: 'GET', url: '/x' });
  const second = await app.inject({ method: 'GET', url: '/x' });
  console.log('goodApp  request 1:', first.json());
  console.log('goodApp  request 2:', second.json());
  // requestNumber differs between the two — no leakage between requests.

  await app.close();
}

function attemptTheV4Bug() {
  // In Fastify v4, this line would silently succeed and share one object
  // across every request. In Fastify v5 (what this project uses), it
  // throws immediately at registration time instead:
  const app = Fastify({ logger: false });
  try {
    app.decorateRequest('willFail', { count: 0 }); // object literal default
  } catch (error) {
    console.log('attemptTheV4Bug threw:', (error as Error).message);
  }
}

async function fixedApp() {
  const app = Fastify({ logger: false });

  // The v5-correct fix: no default (or `null`), then assign a fresh object
  // per request inside a hook — one object per request, never shared.
  app.decorateRequest('fixedState');

  app.addHook('onRequest', async (request) => {
    request.fixedState = { count: 0 };
  });

  app.get('/x', async (request) => {
    request.fixedState.count += 1;
    return { count: request.fixedState.count };
  });

  const first = await app.inject({ method: 'GET', url: '/x' });
  const second = await app.inject({ method: 'GET', url: '/x' });
  console.log('fixedApp request 1:', first.json());
  console.log('fixedApp request 2:', second.json());
  // Both print { count: 1 } — each request got its own fresh object.

  await app.close();
}

async function main() {
  await goodApp();
  attemptTheV4Bug();
  await fixedApp();
}

main();

/*
Expected output:

goodApp  request 1: { success: true, data: { version: '1.0.0', requestNumber: 1 } }
goodApp  request 2: { success: true, data: { version: '1.0.0', requestNumber: 2 } }
attemptTheV4Bug threw: The decorator 'willFail' of type 'object' is a reference
type. Use the { getter, setter } interface instead.
fixedApp request 1: { count: 1 }
fixedApp request 2: { count: 1 }

Fastify v5 turned the classic v4 footgun (a shared object leaking state
across unrelated requests) into a hard error at registration time
(FST_ERR_DEC_REFERENCE_TYPE) — you're forced to assign the object fresh,
per request, inside a hook instead of as a static default.
*/
