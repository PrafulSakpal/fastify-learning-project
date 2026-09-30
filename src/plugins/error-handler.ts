import fp from 'fastify-plugin';
import type { FastifyError, FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { AppError } from '../common/errors/app-error.js';

/**
 * P2002's `error.meta` shape differs by Prisma's connection method. With the
 * classic built-in engine it's `{ target: string[] }`; with a driver adapter
 * (this project uses @prisma/adapter-pg — see docs/database/connection-management.md)
 * it's instead nested under `meta.driverAdapterError.cause.constraint.index`,
 * confirmed by triggering a real duplicate-email insert against this project's
 * database. Both are read here so the message stays accurate either way.
 */
function extractConstraintName(error: Prisma.PrismaClientKnownRequestError): string {
  const meta = error.meta as
    | { target?: unknown; driverAdapterError?: { cause?: { constraint?: { index?: string } } } }
    | undefined;

  if (Array.isArray(meta?.target)) {
    return meta.target.join(', ');
  }

  return meta?.driverAdapterError?.cause?.constraint?.index ?? 'a unique field';
}

/**
 * A single global error format for the whole app:
 *   { success: false, error: { code, message, details? } }
 *
 * Wrapped in fastify-plugin — an error handler is only useful if it applies
 * everywhere, so it must attach to the root scope, not an encapsulated one.
 * See docs/fastify/16-error-handling.md.
 */
async function errorHandlerPlugin(app: FastifyInstance) {
  app.setErrorHandler((error: AppError | FastifyError | Prisma.PrismaClientKnownRequestError, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        success: false,
        error: { code: error.code, message: error.message },
      });
    }

    // Prisma's "known" errors carry a stable `code` (P2002, P2025, ...)
    // documented at https://pris.ly/d/prisma-schema — see
    // docs/database/prisma.md for what each of these means and why.
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      switch (error.code) {
        case 'P2002': {
          const constraint = extractConstraintName(error);
          return reply.code(409).send({
            success: false,
            error: {
              code: 'DUPLICATE_RECORD',
              message: `A record violating the "${constraint}" constraint already exists`,
            },
          });
        }
        case 'P2025':
          return reply.code(404).send({
            success: false,
            error: { code: 'RECORD_NOT_FOUND', message: 'Record not found' },
          });
        case 'P2003':
          return reply.code(409).send({
            success: false,
            error: {
              code: 'RELATED_RECORDS_EXIST',
              message: 'Cannot complete this action because related records exist',
            },
          });
        default:
          request.log.error(error);
          return reply.code(500).send({
            success: false,
            error: { code: 'DATABASE_ERROR', message: 'A database error occurred' },
          });
      }
    }

    // Fastify attaches `validation` to errors thrown by its own schema
    // validation step (see docs/fastify/14-validation.md).
    if (error.validation) {
      return reply.code(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: error.validation.map((issue) => ({
            field: issue.instancePath || issue.schemaPath,
            message: issue.message ?? 'is invalid',
          })),
        },
      });
    }

    // @fastify/rate-limit throws a plain Error with only `statusCode: 429`
    // set — no `.code` at all — verified by actually triggering it against
    // POST /auth/login. Without this branch it would fall into the generic
    // passthrough below and get labeled the misleading "BAD_REQUEST".
    if (error.statusCode === 429) {
      return reply.code(429).send({
        success: false,
        error: { code: 'RATE_LIMITED', message: error.message },
      });
    }

    // Fastify itself throws framework-level errors with their own safe
    // statusCode and message for genuine client mistakes that aren't schema
    // validation — e.g. a missing/wrong Content-Type header (415), a body
    // over the size limit (413), or malformed JSON (400). These messages
    // don't leak anything internal, so they're safe to pass through as-is.
    if (error.statusCode && error.statusCode < 500) {
      return reply.code(error.statusCode).send({
        success: false,
        error: { code: error.code ?? 'BAD_REQUEST', message: error.message },
      });
    }

    // Anything left is a real bug — log the full error server-side, but
    // never leak its details (stack trace, DB error text, etc.) to the client.
    request.log.error(error);
    return reply.code(500).send({
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Something went wrong' },
    });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send({
      success: false,
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: `Route ${request.method} ${request.url} not found`,
      },
    });
  });
}

export default fp(errorHandlerPlugin, { name: 'error-handler' });
