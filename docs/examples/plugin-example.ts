/**
 * Standalone example: the difference `fastify-plugin` makes.
 *
 * Run with:
 *   npx tsx docs/examples/plugin-example.ts
 *
 * See docs/fastify/10-plugins.md.
 */
import Fastify, { type FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

// Module augmentation makes both properties compile everywhere in this file.
// IMPORTANT: this is a compile-time contract only — TypeScript has no idea
// which plugin actually ran `decorate()` at runtime, so it will happily let
// you reference a property here that turns out to be `undefined` because of
// encapsulation. The type system does NOT model plugin scoping; only the
// running app does. That's exactly what this example proves.
declare module 'fastify' {
  interface FastifyInstance {
    plainValue?: string;
    globalValue?: string;
  }
}

// A plain plugin: gets its own encapsulated child context.
async function plainPlugin(app: FastifyInstance) {
  app.decorate('plainValue', 'only visible inside plainPlugin');
  app.get('/inside-plain', async () => ({ value: app.plainValue }));
}

// The same idea, wrapped with fastify-plugin: attaches to the PARENT scope.
async function globalPlugin(app: FastifyInstance) {
  app.decorate('globalValue', 'visible everywhere');
}

async function main() {
  const app = Fastify({ logger: false });

  await app.register(plainPlugin);
  await app.register(fp(globalPlugin));

  app.get('/root', async () => ({
    globalValue: app.globalValue, // defined: fp() broke encapsulation
    plainValueFromRoot: app.plainValue, // undefined at runtime, despite compiling fine
  }));

  const rootResponse = await app.inject({ method: 'GET', url: '/root' });
  console.log('GET /root  →', rootResponse.json());

  const plainResponse = await app.inject({ method: 'GET', url: '/inside-plain' });
  console.log('GET /inside-plain →', plainResponse.json());

  await app.close();
}

main();

/*
Expected output:

GET /root  → { globalValue: 'visible everywhere' }
GET /inside-plain → { value: 'only visible inside plainPlugin' }

`plainValueFromRoot` doesn't even appear in the first line's output — not
because of a compile error, but because `app.plainValue` really is
`undefined` at the root (plainPlugin's decoration never escaped its own
encapsulated scope), and JSON.stringify silently drops `undefined` values.
The type-checker did not catch this, because module augmentation is a
global compile-time contract that has no awareness of per-plugin runtime
scoping — a good reason not to over-trust types alone here.
*/
