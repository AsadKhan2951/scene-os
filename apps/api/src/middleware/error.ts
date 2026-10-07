import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../lib/http';

export const notFoundHandler: RequestHandler = (_req, res) => { res.status(404).json({ error: 'Not found' }); };

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'Check the highlighted fields', fields: err.flatten().fieldErrors });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err?.name === 'CastError') {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server' });
};
