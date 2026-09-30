import type { User } from '@prisma/client';

/**
 * Prisma's `User` includes `password` (a hash) and `Date` objects for the
 * timestamps. This is the one, shared place that both strips `password` and
 * converts dates to ISO strings before a response schema ever sees the
 * object — used by both user.routes.ts and auth.routes.ts, since both
 * return a "public user" shape. See docs/fastify/15-serialization.md and
 * docs/fastify/20-jwt.md.
 */
export function toUserResponse(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
