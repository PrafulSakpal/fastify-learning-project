import 'fastify';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';

/**
 * Module augmentation: tells TypeScript about properties added at runtime via
 * app.decorate() / decorateRequest() / decorateReply(). Without this, code
 * like `app.appName` or `request.startTime` would not compile.
 * See docs/fastify/12-decorators.md.
 */
declare module 'fastify' {
  interface FastifyInstance {
    appName: string;
    prisma: PrismaClient;
    authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>;
    broadcastAppointmentUpdate(payload: unknown): void;
  }

  interface FastifyRequest {
    startTime: number;
  }

  interface FastifyReply {
    success(data: unknown, code?: number): FastifyReply;
  }
}

// @fastify/jwt's own declaration-merging point (see its types/index.d.ts) —
// this is what types request.user and the payload accepted by app.jwt.sign().
// See docs/fastify/20-jwt.md.
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; email: string };
    user: { sub: string; email: string };
  }
}
