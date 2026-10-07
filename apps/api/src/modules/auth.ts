import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { loginSchema } from '@sceneos/shared';
import { User } from '../models';
import { COOKIE, cookieOptions, me, requireAuth, signSession } from '../middleware/auth';
import { HttpError, h } from '../lib/http';

export const authRouter = Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });

authRouter.post('/login', limiter, h(async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw new HttpError(401, 'Email or password is incorrect');
  const session = { id: String(user._id), name: user.name, email: user.email, role: user.role };
  res.cookie(COOKIE, signSession(session), cookieOptions).json(session);
}));

authRouter.post('/logout', (_req, res) => { res.clearCookie(COOKIE, { path: '/' }).status(204).end(); });
authRouter.get('/me', requireAuth, (req, res) => { res.json(me(req)); });
