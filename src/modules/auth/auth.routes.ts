import type { FastifyPluginAsyncJsonSchemaToTs } from '@fastify/type-provider-json-schema-to-ts';
import { AppError } from '../../common/errors/app-error.js';
import { hashPassword, verifyPassword } from '../../common/utils/password.js';
import { toUserResponse } from '../users/user.mappers.js';
import { loginSchema, meSchema, registerSchema } from './auth.schemas.js';

const ACCESS_TOKEN_TTL = '1h';

export const authRoutes: FastifyPluginAsyncJsonSchemaToTs = async (app) => {
  // POST /auth/register — creates the account only; does not log the user
  // in. A separate POST /auth/login issues the actual access token, keeping
  // "create an account" and "authenticate" as two distinct, separately
  // testable steps. See docs/fastify/20-jwt.md.
  app.post('/auth/register', { schema: registerSchema }, async (request, reply) => {
    const { name, email, password } = request.body;

    const user = await app.prisma.user.create({
      data: { name, email, password: await hashPassword(password) },
    });

    return reply.code(201).send(toUserResponse(user));
  });

  // POST /auth/login — a much stricter rate limit than the global default
  // (see src/plugins/rate-limit.ts), via the same route `config` option
  // introduced in Phase 2 (docs/fastify/07-route-options.md). Slows down
  // credential-stuffing/brute-force attempts specifically, without
  // penalizing normal traffic to every other route.
  app.post(
    '/auth/login',
    { schema: loginSchema, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { email, password } = request.body;

      const user = await app.prisma.user.findUnique({ where: { email } });

      // Deliberately the SAME error for "no such user" and "wrong password" —
      // a different message for each would let an attacker enumerate which
      // emails have accounts. See docs/fastify/20-jwt.md.
      if (!user || !(await verifyPassword(password, user.password))) {
        throw AppError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
      }

      // The payload is deliberately minimal (just enough to identify the
      // user) — never embed the password hash or other sensitive fields in a
      // JWT, since its payload is base64-encoded, not encrypted, and readable
      // by anyone holding the token.
      const accessToken = await app.jwt.sign(
        { sub: user.id, email: user.email },
        { expiresIn: ACCESS_TOKEN_TTL },
      );

      return reply.code(200).send({ accessToken, expiresIn: ACCESS_TOKEN_TTL });
    },
  );

  // GET /auth/me — protected by the `authenticate` preHandler decorated in
  // src/plugins/jwt.ts. Only the route's own preHandler list is affected;
  // /auth/register and /auth/login above stay public. See
  // docs/fastify/07-route-options.md and docs/fastify/20-jwt.md.
  app.get(
    '/auth/me',
    { schema: meSchema, preHandler: [app.authenticate] },
    async (request, reply) => {
      const user = await app.prisma.user.findUnique({ where: { id: request.user.sub } });

      if (!user) {
        // The token is valid, but the account it points to was deleted
        // after the token was issued — a real edge case with stateless JWTs.
        throw AppError.notFound('User not found', 'USER_NOT_FOUND');
      }

      return reply.code(200).send(toUserResponse(user));
    },
  );
};
