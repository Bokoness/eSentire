import type { ErrorRequestHandler, RequestHandler } from 'express';

/** Error with an HTTP status that is safe to show to the client. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: 'Not found' });
};

// Central error handler: known HttpErrors are returned as-is; anything else becomes a generic 500
// so stack traces and SQL details never leak to the client.
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, ...(err.details ? { details: err.details } : {}) });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
};
