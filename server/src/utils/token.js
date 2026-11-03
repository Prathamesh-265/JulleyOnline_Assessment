import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const signToken = (userId) =>
  jwt.sign({ sub: userId }, env.JWT_SECRET, { algorithm: 'HS256', expiresIn: env.JWT_EXPIRES_IN });

// Returns the user id, or throws if the token is missing, forged or expired.
export const verifyToken = (token) => jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }).sub;
