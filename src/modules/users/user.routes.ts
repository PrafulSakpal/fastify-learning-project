import type { FastifyPluginAsyncJsonSchemaToTs } from '@fastify/type-provider-json-schema-to-ts';
import { AppError } from '../../common/errors/app-error.js';
import { hashPassword } from '../../common/utils/password.js';
import { toUserResponse } from './user.mappers.js';
import {
  createUserSchema,
  deleteUserSchema,
  getUserSchema,
  listUsersSchema,
  updateUserSchema,
} from './user.schemas.js';

export const userRoutes: FastifyPluginAsyncJsonSchemaToTs = async (app) => {
  app.post('/users', { schema: createUserSchema }, async (request, reply) => {
    const { name, email, password } = request.body;

    const user = await app.prisma.user.create({
      data: { name, email, password: await hashPassword(password) },
    });

    return reply.code(201).send(toUserResponse(user));
  });

  app.get('/users', { schema: listUsersSchema }, async (request, reply) => {
    const { page, limit } = request.query;

    const users = await app.prisma.user.findMany({
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'asc' },
    });

    return reply.code(200).send(users.map(toUserResponse));
  });

  app.get('/users/:id', { schema: getUserSchema }, async (request, reply) => {
    const user = await app.prisma.user.findUnique({ where: { id: request.params.id } });

    if (!user) {
      throw AppError.notFound('User not found', 'USER_NOT_FOUND');
    }

    return reply.code(200).send(toUserResponse(user));
  });

  // Prisma throws P2025 if the id doesn't exist — mapped to a 404 by the
  // global error handler (see docs/database/prisma.md), so no manual
  // existence check is needed here.
  app.patch('/users/:id', { schema: updateUserSchema }, async (request, reply) => {
    const { password, ...rest } = request.body;

    const user = await app.prisma.user.update({
      where: { id: request.params.id },
      data: password ? { ...rest, password: await hashPassword(password) } : rest,
    });

    return reply.code(200).send(toUserResponse(user));
  });

  // Prisma throws P2025 (not found) or P2003 (this user still has
  // appointments referencing it) — both mapped by the global error handler.
  app.delete('/users/:id', { schema: deleteUserSchema }, async (request, reply) => {
    const user = await app.prisma.user.delete({ where: { id: request.params.id } });
    return reply.code(200).send(toUserResponse(user));
  });
};
