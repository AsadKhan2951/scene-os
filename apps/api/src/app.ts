import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type RequestHandler } from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { requireAuth } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/error';
import { HttpError } from './lib/http';
import { aiContextMiddleware } from './lib/ai/context';
import { FILES_DIR } from './lib/higgsfield';
import { actorsRouter } from './modules/actors';
import { authRouter } from './modules/auth';
import { creditsRouter } from './modules/credits';
import { runsRouter } from './modules/runs';
import { scriptDirectorRouter } from './modules/scriptDirector';
import { productionRouter } from './modules/production';
import { directionRouter } from './modules/direction';
import { moneyRouter } from './modules/money';
import { postRouter } from './modules/post';
import { trackingRouter } from './modules/tracking';
import './workflows';
import { locationsRouter } from './modules/locations';
import { documentsRouter } from './modules/documents';
import { dreamerRouter } from './modules/dreamer';
import { evaluationsRouter } from './modules/evaluations';
import { expensesRouter } from './modules/expenses';
import { exportsRouter } from './modules/exports';
import { insightsRouter } from './modules/insights';
import { productionsRouter } from './modules/productions';
import { resourcesRouter } from './modules/resources';
import { teasersRouter } from './modules/teasers';
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
  // Pictures and clips kept on the server (when Spaces is not set up). Public on purpose: Higgsfield
  // reads them back to make clips and edits. Names carry database ids, so they are not guessable.
  app.use('/api/files', express.static(FILES_DIR(), { maxAge: '30d', immutable: true, index: false, dotfiles: 'deny' }), (_req, res) => { res.status(404).end(); });

  const api = express.Router();
  api.use(requireAuth);
  // Every AI call made while handling this request is metered against the signed-in person.
  api.use(aiContextMiddleware);
  api.use('/credits', creditsRouter);
  api.use('/runs', runsRouter);
  api.use('/script-director', scriptDirectorRouter);
  api.use('/production', productionRouter);
  api.use('/direction', directionRouter);
  api.use('/money', moneyRouter);
  api.use('/post', postRouter);
  api.use('/tracking', trackingRouter);
  api.use('/actors', actorsRouter);
  api.use('/locations', locationsRouter);
  api.use('/productions', productionsRouter);
  api.use('/expenses', expensesRouter);
  api.use('/insights', insightsRouter);
  api.use('/documents', documentsRouter);
  api.use('/evaluations', evaluationsRouter);
  api.use('/exports', exportsRouter);
  api.use('/writers', writersRouter);
  api.use('/dreamer', dreamerRouter);
  api.use('/teasers', teasersRouter);
  api.use('/', resourcesRouter);
  app.use('/api', api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
