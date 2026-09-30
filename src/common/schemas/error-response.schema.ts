/**
 * The one error shape every endpoint in this app can return. Shared across
 * modules so response schemas for 400/404/500 all look identical to clients.
 * See docs/fastify/16-error-handling.md.
 */
export const errorResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    error: {
      type: 'object',
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
        details: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              field: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
      required: ['code', 'message'],
    },
  },
  required: ['success', 'error'],
} as const;
