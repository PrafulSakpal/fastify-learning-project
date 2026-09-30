import { errorResponseSchema } from '../../common/schemas/error-response.schema.js';
import { paginationProperties } from '../../common/schemas/pagination.schema.js';

const APPOINTMENT_STATUSES = ['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED'] as const;
const TIME_PATTERN = '^([01]\\d|2[0-3]):[0-5]\\d$'; // "HH:MM", 24-hour

export const appointmentParamsSchema = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'string', minLength: 1 },
  },
} as const;

export const appointmentQuerystringSchema = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: APPOINTMENT_STATUSES },
    ...paginationProperties,
  },
} as const;

export const createAppointmentBodySchema = {
  type: 'object',
  required: ['userId', 'serviceId', 'date', 'startTime', 'endTime'],
  additionalProperties: false,
  properties: {
    userId: { type: 'string', minLength: 1 },
    serviceId: { type: 'string', minLength: 1 },
    date: { type: 'string', format: 'date' },
    startTime: { type: 'string', pattern: TIME_PATTERN },
    endTime: { type: 'string', pattern: TIME_PATTERN },
  },
} as const;

export const updateAppointmentBodySchema = {
  type: 'object',
  minProperties: 1,
  additionalProperties: false,
  properties: {
    date: { type: 'string', format: 'date' },
    startTime: { type: 'string', pattern: TIME_PATTERN },
    endTime: { type: 'string', pattern: TIME_PATTERN },
    status: { type: 'string', enum: APPOINTMENT_STATUSES },
  },
} as const;

// Intentionally does NOT list `internalNotes` — the serializer strips it,
// even loaded straight from a real database row. See
// docs/fastify/15-serialization.md and docs/database/prisma.md.
export const appointmentResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'userId',
    'serviceId',
    'date',
    'startTime',
    'endTime',
    'status',
    'createdAt',
    'updatedAt',
  ],
  properties: {
    id: { type: 'string' },
    userId: { type: 'string' },
    serviceId: { type: 'string' },
    date: { type: 'string' },
    startTime: { type: 'string' },
    endTime: { type: 'string' },
    status: { type: 'string', enum: APPOINTMENT_STATUSES },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
  },
} as const;

export const appointmentListResponseSchema = {
  type: 'array',
  items: appointmentResponseSchema,
} as const;

export const appointmentStatsResponseSchema = {
  type: 'object',
  additionalProperties: { type: 'integer' },
} as const;

export const createAppointmentSchema = {
  body: createAppointmentBodySchema,
  response: {
    201: appointmentResponseSchema,
    400: errorResponseSchema,
    404: errorResponseSchema,
    409: errorResponseSchema,
  },
} as const;

export const updateAppointmentSchema = {
  params: appointmentParamsSchema,
  body: updateAppointmentBodySchema,
  response: {
    200: appointmentResponseSchema,
    400: errorResponseSchema,
    404: errorResponseSchema,
    409: errorResponseSchema,
  },
} as const;

export const getAppointmentSchema = {
  params: appointmentParamsSchema,
  response: {
    200: appointmentResponseSchema,
    404: errorResponseSchema,
  },
} as const;

export const listAppointmentsSchema = {
  querystring: appointmentQuerystringSchema,
  response: {
    200: appointmentListResponseSchema,
  },
} as const;

export const cancelAppointmentSchema = {
  params: appointmentParamsSchema,
  response: {
    200: appointmentResponseSchema,
    404: errorResponseSchema,
  },
} as const;

export const appointmentStatsSchema = {
  response: {
    200: appointmentStatsResponseSchema,
  },
} as const;
