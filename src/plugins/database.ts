import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Connects Prisma once, at boot, and decorates the whole app with the
 * client — every route reaches the database via `app.prisma`, never by
 * importing a client of its own. Wrapped in fastify-plugin so `app.prisma`
 * is visible everywhere, not just inside this file's own encapsulated scope.
 * See docs/database/connection-management.md.
 */
async function databasePlugin(app: FastifyInstance) {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }

  // Prisma 7: a direct TCP connection is made through an explicit driver
  // adapter (here, node-postgres) instead of a `url` baked into the schema.
  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  await prisma.$connect();
  app.log.info('Prisma connected');

  app.decorate('prisma', prisma);

  // Runs on app.close() — see docs/fastify/25-graceful-shutdown.md (Phase 8).
  app.addHook('onClose', async () => {
    await prisma.$disconnect();
    app.log.info('Prisma disconnected');
  });
}

export default fp(databasePlugin, { name: 'database' });
