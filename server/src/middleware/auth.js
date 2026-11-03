import { prisma } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import { verifyToken } from '../utils/token.js';

// Shared by the HTTP middleware and the socket handshake.
export async function userFromToken(token) {
  let id;
  try {
    id = verifyToken(token);
  } catch {
    throw new ApiError(401, 'Invalid or expired token');
  }
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, email: true } });
  if (!user) throw new ApiError(401, 'Invalid or expired token');
  return user;
}

export async function authenticate(req, _res, next) {
  const [scheme, token] = (req.headers.authorization ?? '').split(' ');
  if (scheme !== 'Bearer' || !token) throw new ApiError(401, 'Missing token');
  req.user = await userFromToken(token);
  next();
}
