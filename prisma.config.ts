// Used only by the Prisma CLI (migrate/generate/studio) — the app itself
// never imports this file. See docs/database/connection-management.md.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
