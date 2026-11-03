import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { ApiError } from '../utils/ApiError.js';

export function notFound(_req, _res, next) {
  next(new ApiError(404, 'Route not found'));
}

export function errorHandler(err, _req, res, _next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message, ...err.extra });
  }

  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    return res.status(400).json({ error: 'Validation failed', details });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Already exists' });
    if (err.code === 'P2003') return res.status(400).json({ error: 'Invalid reference' });
    if (err.code === 'P2025') return res.status(404).json({ error: 'Not found' });
  }

  // body-parser errors (bad JSON, payload too large) carry a safe status
  if (err.status >= 400 && err.status < 500 && err.expose) {
    return res.status(err.status).json({ error: err.message });
  }

  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
}
