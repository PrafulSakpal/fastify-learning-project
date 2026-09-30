import { errorResponseSchema } from '../../common/schemas/error-response.schema.js';
import { userResponseSchema } from '../users/user.schemas.js';

export const registerBodySchema = {
  type: 'object',
  required: ['name', 'email', 'password'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1 },
    email: { type: 'string', format: 'email' },
    password: { type: 'string', minLength: 8 },
  },
} as const;

export const loginBodySchema = {
  type: 'object',
  required: ['email', 'password'],
  additionalProperties: false,
  properties: {
    email: { type: 'string', format: 'email' },
    password: { type: 'string', minLength: 1 },
  },
} as const;

export const loginResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['accessToken', 'expiresIn'],
  properties: {
    accessToken: { type: 'string' },
    expiresIn: { type: 'string' },
  },
} as const;

export const registerSchema = {
  body: registerBodySchema,
  response: {
    201: userResponseSchema,
    400: errorResponseSchema,
    409: errorResponseSchema,
  },
} as const;

export const loginSchema = {
  body: loginBodySchema,
  response: {
    200: loginResponseSchema,
    401: errorResponseSchema,
  },
} as const;

export const meSchema = {
  response: {
    200: userResponseSchema,
    401: errorResponseSchema,
    404: errorResponseSchema,
  },
} as const;
