import { errorResponseSchema } from '../../common/schemas/error-response.schema.js';
import { paginationProperties } from '../../common/schemas/pagination.schema.js';

export const userParamsSchema = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'string', minLength: 1 },
  },
} as const;

export const userQuerystringSchema = {
  type: 'object',
  properties: { ...paginationProperties },
} as const;

export const createUserBodySchema = {
  type: 'object',
  required: ['name', 'email', 'password'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1 },
    email: { type: 'string', format: 'email' },
    password: { type: 'string', minLength: 8 },
  },
} as const;

export const updateUserBodySchema = {
  type: 'object',
  minProperties: 1,
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1 },
    email: { type: 'string', format: 'email' },
    password: { type: 'string', minLength: 8 },
  },
} as const;

export const userResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'name', 'email', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    email: { type: 'string' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
  },
} as const;

export const userListResponseSchema = {
  type: 'array',
  items: userResponseSchema,
} as const;

export const createUserSchema = {
  body: createUserBodySchema,
  response: {
    201: userResponseSchema,
    400: errorResponseSchema,
    409: errorResponseSchema,
  },
} as const;

export const listUsersSchema = {
  querystring: userQuerystringSchema,
  response: {
    200: userListResponseSchema,
  },
} as const;

export const getUserSchema = {
  params: userParamsSchema,
  response: {
    200: userResponseSchema,
    404: errorResponseSchema,
  },
} as const;

export const updateUserSchema = {
  params: userParamsSchema,
  body: updateUserBodySchema,
  response: {
    200: userResponseSchema,
    400: errorResponseSchema,
    404: errorResponseSchema,
    409: errorResponseSchema,
  },
} as const;

export const deleteUserSchema = {
  params: userParamsSchema,
  // Returns the deleted record (200) rather than a bare 204 — keeps every
  // route in this app returning a schema-validated JSON body, consistent
  // with how DELETE /appointments/:id (cancel) also returns the record.
  response: {
    200: userResponseSchema,
    404: errorResponseSchema,
    409: errorResponseSchema,
  },
} as const;
