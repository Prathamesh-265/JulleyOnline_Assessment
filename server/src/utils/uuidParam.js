import { z } from 'zod';
import { ApiError } from './ApiError.js';

const uuid = z.string().uuid();

// Use with router.param('id', uuidParam) so a bad id is a clean 400, not a DB error.
export function uuidParam(_req, _res, next, value) {
  if (!uuid.safeParse(value).success) throw new ApiError(400, 'Invalid id');
  next();
}
