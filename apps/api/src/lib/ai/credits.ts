import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { ACTION_QUOTES, RATE_TABLE_VERSION, creditsFor, type QuotedAction } from '@sceneos/shared';
import { env } from '../../config/env';
import { HttpError } from '../http';
import { CreditAccount, CreditHold, CreditLedger, UsageEvent } from '../../models';
import { aiContext, type AiContext } from './context';

const round = (n: number) => Math.round(n * 100) / 100;
const monthKey = (d = new Date()) => d.toISOString().slice(0, 7);

/**
 * The workspace's credit account, created on first use. At the start of each month the
 * balance is topped up to the monthly allowance (credits bought on top are kept).
 */
export async function getAccount(orgId: string) {
  let acc = await CreditAccount.findOneAndUpdate(
    { orgId },
    { $setOnInsert: { orgId, monthlyCredits: env.CREDITS_MONTHLY, markup: env.CREDITS_MARKUP } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  const key = monthKey();
  if (acc.periodKey !== key) {
    const before = acc.balance;
    // The periodKey condition makes the monthly top-up happen once even if two requests race.
    const topped = await CreditAccount.findOneAndUpdate(
      { orgId, periodKey: acc.periodKey ?? null },
      { $set: { periodKey: key }, $max: { balance: acc.monthlyCredits } },
      { new: true },
    );
    if (topped) {
      acc = topped;
      const added = round(topped.balance - before);
      if (added > 0) await CreditLedger.create({ orgId, kind: 'grant', credits: added, balanceAfter: topped.balance, heldAfter: topped.held, note: `Monthly credits for ${key}` });
    } else {
      acc = (await CreditAccount.findOne({ orgId }))!;
    }
  }
  return acc;
}

export const available = (acc: { balance: number; held: number }) => round(acc.balance - acc.held);

const noCredits = (need: number, have: number) =>
  new HttpError(402, `Not enough AI credits: this needs about ${Math.ceil(need)} and ${Math.max(0, Math.floor(have))} are left. Ask an admin to add credits`);

/** Refuses an action up front when the account cannot cover its quote. Nothing is reserved. */
export async function ensureCredits(action: QuotedAction, multiplier = 1) {
  const ctx = aiContext();
  const acc = await getAccount(ctx.orgId);
  const need = ACTION_QUOTES[action] * multiplier;
  if (acc.hardLimit && available(acc) < need) throw noCredits(need, available(acc));
  return { quote: need, available: available(acc) };
}

/** Reserves credits for a queued run. Returns the run id to pass to the job. */
export async function holdCredits(action: QuotedAction, multiplier = 1, runId = randomUUID()) {
  const ctx = aiContext();
  const acc = await getAccount(ctx.orgId);
  const amount = round(ACTION_QUOTES[action] * multiplier);
  const filter = acc.hardLimit
    ? { orgId: ctx.orgId, $expr: { $gte: [{ $subtract: ['$balance', '$held'] }, amount] } }
    : { orgId: ctx.orgId };
  const after = await CreditAccount.findOneAndUpdate(filter, { $inc: { held: amount } }, { new: true });
  if (!after) throw noCredits(amount, available(acc));
  await CreditHold.create({ orgId: ctx.orgId, runId, action, amount, userId: ctx.userId });
  await CreditLedger.create({ orgId: ctx.orgId, kind: 'hold', credits: -amount, balanceAfter: after.balance, heldAfter: after.held, runId, userId: ctx.userId, note: action });
  return runId;
}

/** Gives back whatever a finished run did not use. Safe to call more than once. */
export async function releaseHold(runId: string) {
  const hold = await CreditHold.findOneAndUpdate({ runId, status: 'open' }, { $set: { status: 'released', releasedAt: new Date() } }, { new: true });
  if (!hold) return;
  const left = round(Math.max(0, hold.amount - hold.used));
  if (left <= 0) return;
  const after = await CreditAccount.findOneAndUpdate({ orgId: hold.orgId }, { $inc: { held: -left } }, { new: true });
  await CreditLedger.create({ orgId: hold.orgId, kind: 'release', credits: left, balanceAfter: after?.balance, heldAfter: after?.held, runId });
}

export interface UsageInput {
  provider: 'anthropic' | 'higgsfield' | 'elevenlabs' | 'google';
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  unit?: string;
  quantity?: number;
  costUsd: number;
  latencyMs?: number;
}

/**
 * Records one provider call and charges it. Called by the gateway after every successful call.
 * Metering must never break the feature, so a failure here is logged, not thrown.
 */
export async function charge(u: UsageInput, ctx: AiContext = aiContext()) {
  // No database (unit tests, a script run without connecting): nothing to record against.
  if (mongoose.connection.readyState !== 1) return;
  try {
    const acc = await getAccount(ctx.orgId);
    const credits = creditsFor(u.costUsd, acc.markup, env.CREDIT_USD);
    const event = await UsageEvent.create({
      ...u, orgId: ctx.orgId, userId: ctx.userId, userName: ctx.userName, productionId: ctx.productionId, storyId: ctx.storyId,
      feature: ctx.feature, action: ctx.action, runId: ctx.runId, credits, markup: acc.markup, rateVersion: RATE_TABLE_VERSION,
    });
    if (credits <= 0) return;
    // A run's debits come out of its hold first, so the held amount shrinks as it is used.
    let fromHold = 0;
    if (ctx.runId) {
      const hold = await CreditHold.findOne({ runId: ctx.runId, status: 'open' }).lean();
      if (hold) {
        fromHold = round(Math.min(credits, Math.max(0, hold.amount - hold.used)));
        if (fromHold > 0) await CreditHold.updateOne({ _id: hold._id }, { $inc: { used: fromHold } });
      }
    }
    const after = await CreditAccount.findOneAndUpdate({ orgId: ctx.orgId }, { $inc: { balance: -credits, held: -fromHold } }, { new: true });
    await CreditLedger.create({ orgId: ctx.orgId, kind: 'debit', credits: -credits, balanceAfter: after?.balance, heldAfter: after?.held, runId: ctx.runId, usageEventId: event._id, userId: ctx.userId, note: `${u.provider} ${u.model ?? u.unit ?? ''}`.trim() });
  } catch (err) {
    console.error('Could not record AI usage', err);
  }
}

/** Admin top-up or correction. */
export async function grantCredits(orgId: string, credits: number, by: string, note?: string) {
  await getAccount(orgId);
  const after = await CreditAccount.findOneAndUpdate({ orgId }, { $inc: { balance: credits } }, { new: true });
  await CreditLedger.create({ orgId, kind: credits >= 0 ? 'grant' : 'adjust', credits, balanceAfter: after?.balance, heldAfter: after?.held, userId: by, note });
  return after;
}
