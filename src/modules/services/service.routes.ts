import type { FastifyPluginAsyncJsonSchemaToTs } from '@fastify/type-provider-json-schema-to-ts';
import type { Service } from '@prisma/client';
import { AppError } from '../../common/errors/app-error.js';
import {
  createServiceSchema,
  deleteServiceSchema,
  getServiceSchema,
  listServicesSchema,
  updateServiceSchema,
} from './service.schemas.js';

const SERVICES_CACHE_KEY = 'services:list';
const SERVICES_CACHE_TTL_SECONDS = 60;

/**
 * Prisma returns `price` as a Decimal object and dates as `Date` objects;
 * the response schema (and the wire format) says `string` for both — see
 * the same note in user.routes.ts.
 */
function toServiceResponse(service: Service) {
  return {
    ...service,
    price: service.price.toString(),
    createdAt: service.createdAt.toISOString(),
    updatedAt: service.updatedAt.toISOString(),
  };
}

export const serviceRoutes: FastifyPluginAsyncJsonSchemaToTs = async (app) => {
  app.post('/services', { schema: createServiceSchema }, async (request, reply) => {
    const service = await app.prisma.service.create({ data: request.body });
    await app.redis.del(SERVICES_CACHE_KEY); // the cached list is now stale
    return reply.code(201).send(toServiceResponse(service));
  });

  // Cache-aside pattern: Redis first, Postgres only on a miss. See
  // docs/redis/caching.md — including why this route caches the FULL list
  // under one key and paginates in memory, rather than one cache key per
  // page/limit combination.
  app.get('/services', { schema: listServicesSchema }, async (request, reply) => {
    const { page, limit } = request.query;

    const cached = await app.redis.get(SERVICES_CACHE_KEY);
    let allServices: ReturnType<typeof toServiceResponse>[];

    if (cached) {
      allServices = JSON.parse(cached);
      reply.header('x-cache', 'HIT');
    } else {
      const services = await app.prisma.service.findMany({ orderBy: { createdAt: 'asc' } });
      allServices = services.map(toServiceResponse);
      await app.redis.set(
        SERVICES_CACHE_KEY,
        JSON.stringify(allServices),
        'EX',
        SERVICES_CACHE_TTL_SECONDS,
      );
      reply.header('x-cache', 'MISS');
    }

    const start = (page - 1) * limit;
    return reply.code(200).send(allServices.slice(start, start + limit));
  });

  app.get('/services/:id', { schema: getServiceSchema }, async (request, reply) => {
    const service = await app.prisma.service.findUnique({ where: { id: request.params.id } });

    if (!service) {
      throw AppError.notFound('Service not found', 'SERVICE_NOT_FOUND');
    }

    return reply.code(200).send(toServiceResponse(service));
  });

  app.patch('/services/:id', { schema: updateServiceSchema }, async (request, reply) => {
    const service = await app.prisma.service.update({
      where: { id: request.params.id },
      data: request.body,
    });

    await app.redis.del(SERVICES_CACHE_KEY);

    return reply.code(200).send(toServiceResponse(service));
  });

  // Prisma throws P2003 if any appointment still references this service —
  // mapped to a 409 by the global error handler.
  app.delete('/services/:id', { schema: deleteServiceSchema }, async (request, reply) => {
    const service = await app.prisma.service.delete({ where: { id: request.params.id } });
    await app.redis.del(SERVICES_CACHE_KEY);
    return reply.code(200).send(toServiceResponse(service));
  });
};
