import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type RequestHandler } from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { requireAuth } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/error';
import { HttpError } from './lib/http';
import { authRouter } from './modules/auth';
import { documentsRouter } from './modules/documents';
import { dreamerRouter } from './modules/dreamer';
import { evaluationsRouter } from './modules/evaluations';
import { expensesRouter } from './modules/expenses';
import { exportsRouter } from './modules/exports';
import { insightsRouter } from './modules/insights';
import { productionsRouter } from './modules/productions';
import { resourcesRouter } from './modules/resources';
import { writersRouter } from './modules/writers';

/** The session lives in a cookie, so refuse state-changing requests that come from another site. */
const sameOrigin: RequestHandler = (req, _res, next) => {
  const origin = req.get('origin');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && origin && origin !== env.WEB_ORIGIN) {
    return next(new HttpError(403, 'Request blocked'));
  }
  next();
};

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  app.use(sameOrigin);

  app.get('/api/healthz', (_req, res) => { res.json({ ok: true }); });
  app.use('/api/auth', authRouter);

  const api = express.Router();
  api.use(requireAuth);
  api.use('/productions', productionsRouter);
  api.use('/expenses', expensesRouter);
  api.use('/insights', insightsRouter);
  api.use('/documents', documentsRouter);
  api.use('/evaluations', evaluationsRouter);
  api.use('/exports', exportsRouter);
  api.use('/writers', writersRouter);
  api.use('/dreamer', dreamerRouter);
  api.use('/', resourcesRouter);
  app.use('/api', api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
