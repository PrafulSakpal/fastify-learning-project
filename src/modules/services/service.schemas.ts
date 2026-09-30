import { errorResponseSchema } from '../../common/schemas/error-response.schema.js';
import { paginationProperties } from '../../common/schemas/pagination.schema.js';

export const serviceParamsSchema = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'string', minLength: 1 },
  },
} as const;

export const serviceQuerystringSchema = {
  type: 'object',
  properties: { ...paginationProperties },
} as const;

export const createServiceBodySchema = {
  type: 'object',
  required: ['name', 'duration', 'price'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1 },
    description: { type: 'string' },
    duration: { type: 'integer', minimum: 1, description: 'minutes' },
    price: { type: 'number', minimum: 0 },
  },
} as const;

export const updateServiceBodySchema = {
  type: 'object',
  minProperties: 1,
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1 },
    description: { type: 'string' },
    duration: { type: 'integer', minimum: 1 },
    price: { type: 'number', minimum: 0 },
  },
} as const;

export const serviceResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'name', 'description', 'duration', 'price', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string', nullable: true },
    duration: { type: 'integer' },
    price: { type: 'string' }, // Prisma Decimal is serialized as a string — see docs/database/prisma.md
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
  },
} as const;

export const serviceListResponseSchema = {
  type: 'array',
  items: serviceResponseSchema,
} as const;

export const createServiceSchema = {
  body: createServiceBodySchema,
  response: {
    201: serviceResponseSchema,
    400: errorResponseSchema,
  },
} as const;

export const listServicesSchema = {
  querystring: serviceQuerystringSchema,
  response: {
    200: serviceListResponseSchema,
  },
} as const;

export const getServiceSchema = {
  params: serviceParamsSchema,
  response: {
    200: serviceResponseSchema,
    404: errorResponseSchema,
  },
} as const;

export const updateServiceSchema = {
  params: serviceParamsSchema,
  body: updateServiceBodySchema,
  response: {
    200: serviceResponseSchema,
    400: errorResponseSchema,
    404: errorResponseSchema,
  },
} as const;

export const deleteServiceSchema = {
  params: serviceParamsSchema,
  // Returns the deleted record (200) rather than a bare 204 — see the same
  // note in user.schemas.ts.
  response: {
    200: serviceResponseSchema,
    404: errorResponseSchema,
    409: errorResponseSchema,
  },
} as const;
