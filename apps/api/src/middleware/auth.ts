import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import type { Role } from '@sceneos/shared';
import { env, isProd } from '../config/env';
import { HttpError } from '../lib/http';

export interface AuthUser { id: string; name: string; email: string; role: Role }

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { user?: AuthUser }
  }
}

export const COOKIE = 'sceneos_session';
export const cookieOptions = { httpOnly: true, sameSite: 'lax' as const, secure: isProd, maxAge: 7 * 24 * 3600 * 1000, path: '/' };

export const signSession = (user: AuthUser) => jwt.sign(user, env.JWT_SECRET, { expiresIn: '7d' });

export const requireAuth: RequestHandler = (req, _res, next) => {
  const token = req.cookies?.[COOKIE];
  if (!token) return next(new HttpError(401, 'Sign in to continue'));
  try {
    const { id, name, email, role } = jwt.verify(token, env.JWT_SECRET) as AuthUser;
    req.user = { id, name, email, role };
    next();
  } catch {
    next(new HttpError(401, 'Your session has expired. Sign in again'));
  }
};

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (req.user?.role !== 'admin') return next(new HttpError(403, 'Only admins can do this'));
  next();
};

export function me(req: { user?: AuthUser }): AuthUser {
  if (!req.user) throw new HttpError(401, 'Sign in to continue');
  return req.user;
}
