import { AsyncLocalStorage } from 'node:async_hooks';
import type { RequestHandler } from 'express';
import type { AiFeature } from '@sceneos/shared';

/**
 * Who and what an AI call is for. Set once per request (or per worker job) and read by the
 * gateway, so every provider call is metered against the right workspace, person, production
 * and feature without passing these through every function.
 */
export interface AiContext {
  orgId: string;
  userId?: string;
  userName?: string;
  productionId?: string;
  storyId?: string;
  feature: AiFeature;
  action?: string;
  /** Set for queued jobs that reserved credits; debits are charged against that hold. */
  runId?: string;
}

/** Until organisations exist every record belongs to one workspace. */
export const DEFAULT_ORG = 'default';

const store = new AsyncLocalStorage<AiContext>();

export function aiContext(): AiContext {
  return store.getStore() ?? { orgId: DEFAULT_ORG, feature: 'other' };
}

/** Runs fn with this context; used by the worker for each job. */
export function withAiContext<T>(ctx: AiContext, fn: () => Promise<T>): Promise<T> {
  return store.run({ ...ctx }, fn);
}

/** Names the feature and action for the rest of this request. */
export function setAi(fields: Partial<Omit<AiContext, 'orgId'>>) {
  const current = store.getStore();
  if (current) Object.assign(current, fields);
}

/** After sign-in: every request gets its own context with the signed-in person. */
export const aiContextMiddleware: RequestHandler = (req, _res, next) => {
  store.run({ orgId: DEFAULT_ORG, userId: req.user?.id, userName: req.user?.name, feature: 'other' }, next);
};

/** The parts of a context a queued job carries to the worker. */
export type AiJobContext = Pick<AiContext, 'orgId' | 'userId' | 'userName' | 'productionId' | 'storyId' | 'feature' | 'action' | 'runId'>;
export const jobContext = (extra: Partial<AiJobContext> = {}): AiJobContext => ({ ...aiContext(), ...extra });
