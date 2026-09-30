/**
 * Standalone example: the encapsulation tree —
 *
 *   Root
 *    ├── Plugin A
 *    │     └── Child (nested inside Plugin A)
 *    └── Plugin B
 *
 * Rule proven below: a Child sees everything its ancestors (Plugin A, Root)
 * added, but Plugin B — a sibling of Plugin A — sees none of Plugin A's
 * hooks/decorators, and Root sees none of either plugin's.
 *
 * Run with:
 *   npx tsx docs/examples/encapsulation-example.ts
 *
 * See docs/fastify/11-encapsulation.md.
 */
import Fastify, { type FastifyInstance } from 'fastify';

const log: string[] = [];

async function main() {
  const app = Fastify({ logger: false });

  app.get('/root', async () => {
    log.push('root handler ran');
    return { scope: 'root' };
  });

  async function pluginA(a: FastifyInstance) {
    a.addHook('preHandler', async () => log.push('Plugin A hook ran'));

    a.get('/a', async () => {
      log.push('Plugin A handler ran');
      return { scope: 'A' };
    });

    // Child, nested inside Plugin A — inherits Plugin A's hook.
    a.register(async function child(c: FastifyInstance) {
      c.addHook('preHandler', async () => log.push('Child hook ran'));

      c.get('/a/child', async () => {
        log.push('Child handler ran');
        return { scope: 'A/child' };
      });
    });
  }

  async function pluginB(b: FastifyInstance) {
    // Deliberately does NOT add a hook — used to prove it never inherits
    // Plugin A's hook, since they're siblings, not parent/child.
    b.get('/b', async () => {
      log.push('Plugin B handler ran');
      return { scope: 'B' };
    });
  }

  app.register(pluginA);
  app.register(pluginB);

  for (const url of ['/root', '/a', '/a/child', '/b']) {
    log.length = 0;
    await app.inject({ method: 'GET', url });
    console.log(`${url.padEnd(10)} →`, log.join(' | '));
  }

  await app.close();
}

main();

/*
Expected output:

/root      → root handler ran
/a         → Plugin A hook ran | Plugin A handler ran
/a/child   → Plugin A hook ran | Child hook ran | Child handler ran
/b         → Plugin B handler ran

Notice /b never runs "Plugin A hook ran" (siblings don't share hooks), while
/a/child runs BOTH Plugin A's hook and its own (children inherit ancestors).
*/
