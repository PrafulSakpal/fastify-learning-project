/**
 * A known, expected application error — as opposed to a bug/unexpected
 * exception. Thrown from anywhere in a route/handler and turned into a
 * consistent JSON response by the global error handler.
 * See docs/fastify/16-error-handling.md.
 */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'AppError';
  }

  static notFound(message: string, code = 'NOT_FOUND') {
    return new AppError(code, message, 404);
  }

  static badRequest(message: string, code = 'BAD_REQUEST') {
    return new AppError(code, message, 400);
  }

  static conflict(message: string, code = 'CONFLICT') {
    return new AppError(code, message, 409);
  }

  static unauthorized(message: string, code = 'UNAUTHORIZED') {
    return new AppError(code, message, 401);
  }
}
