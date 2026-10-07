import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { BOARD_STEPS, DEPARTMENTS, MILESTONE_CATEGORIES, PRODUCTION_STATUSES, STEP_STATUSES } from '@sceneos/shared';
import { env } from '../config/env';
import { CallSheet, DreamerChat, Episode, ExpenseSheet, Milestone, Person } from '../models';
import type { AuthUser } from '../middleware/auth';
import { HttpError } from '../lib/http';
import { claude } from '../lib/anthropic';
import { audit } from '../lib/audit';
import { decideSheet, sheetTotals } from './expenses.service';
import { portfolio } from './insights.service';
import { advanceStage, setProductionStatus } from './productions.service';

const id = z.string().regex(/^[a-f0-9]{24}$/i);

interface ToolDef<S extends z.ZodTypeAny = z.ZodTypeAny> {
  description: string;
  input: S;
  json: Anthropic.Tool['input_schema'];
  /** Actions that commit money or change a production's state wait for the person to confirm. */
  confirm?: boolean;
  adminOnly?: boolean;
  summarise?: (input: z.infer<S>) => Promise<string>;
  run: (input: z.infer<S>, user: AuthUser) => Promise<string>;
}
const tool = <S extends z.ZodTypeAny>(def: ToolDef<S>) => def as unknown as ToolDef;
const obj = (properties: Record<string, unknown>, required: string[]): Anthropic.Tool['input_schema'] => ({ type: 'object', properties, required });
const str = (description: string, extra: Record<string, unknown> = {}) => ({ type: 'string', description, ...extra });
const PID = str('The production id from the context');
const titleOf = async (productionId: string) => (await portfolio({ _id: productionId }))[0]?.title ?? 'this production';

const TOOLS: Record<string, ToolDef> = {
  list_productions: tool({
    description: 'Get every active or on-hold production with stage, scenes, budget and health.',
    input: z.object({}),
    json: obj({}, []),
    run: async () => JSON.stringify(await portfolio({ status: { $in: ['active', 'on_hold'] } })),
  }),
  update_production_status: tool({
    description: 'Change a production status.',
    input: z.object({ productionId: id, status: z.enum(PRODUCTION_STATUSES) }),
    json: obj({ productionId: PID, status: str('New status', { enum: PRODUCTION_STATUSES }) }, ['productionId', 'status']),
    confirm: true,
    summarise: async (i) => `Change ${await titleOf(i.productionId)} to ${i.status.replace('_', ' ')}`,
    run: async (i, user) => { const p = await setProductionStatus(i.productionId, i.status, user, 'dreamer'); return `${p.title} is now ${p.status.replace('_', ' ')}.`; },
  }),
  advance_pipeline_stage: tool({
    description: 'Complete the current pipeline stage of a production and start the next one.',
    input: z.object({ productionId: id, note: z.string().max(2000).optional() }),
    json: obj({ productionId: PID, note: str('Completion note') }, ['productionId']),
    confirm: true,
    adminOnly: true,
    summarise: async (i) => { const [p] = await portfolio({ _id: i.productionId }); return `Complete stage ${p?.currentStage}, ${p?.stageName}, on ${p?.title}`; },
    run: async (i, user) => { const p = await advanceStage(i.productionId, i.note, user, 'dreamer'); return `${p.title} moved to stage ${p.currentStage}.`; },
  }),
  create_milestone: tool({
    description: 'Create a milestone on a production.',
    input: z.object({ productionId: id, title: z.string().min(1).max(200), category: z.enum(MILESTONE_CATEGORIES), dueDate: z.coerce.date(), assignee: z.string().max(200).optional() }),
    json: obj({ productionId: PID, title: str('Milestone title'), category: str('Phase', { enum: MILESTONE_CATEGORIES }), dueDate: str('Due date, YYYY-MM-DD'), assignee: str('Who owns it') }, ['productionId', 'title', 'category', 'dueDate']),
    run: async (i) => { await Milestone.create(i); return `Created milestone "${i.title}", due ${i.dueDate.toDateString()}.`; },
  }),
  add_cast_or_crew: tool({
    description: 'Add a person to a production.',
    input: z.object({ productionId: id, name: z.string().min(1).max(200), role: z.string().min(1).max(200), department: z.enum(DEPARTMENTS) }),
    json: obj({ productionId: PID, name: str('Full name'), role: str('Role on the production'), department: str('Department', { enum: DEPARTMENTS }) }, ['productionId', 'name', 'role', 'department']),
    run: async (i) => { await Person.create(i); return `Added ${i.name} as ${i.role}.`; },
  }),
  create_call_sheet: tool({
    description: 'Create a draft call sheet for a shoot date. It is not published.',
    input: z.object({ productionId: id, shootDate: z.coerce.date(), location: z.string().max(200).optional(), generalCall: z.string().max(20).optional() }),
    json: obj({ productionId: PID, shootDate: str('Shoot date, YYYY-MM-DD'), location: str('Location'), generalCall: str('General call time, e.g. 6:30 am') }, ['productionId', 'shootDate']),
    run: async (i) => { await CallSheet.create({ ...i, status: 'draft' }); return `Created a draft call sheet for ${i.shootDate.toDateString()}${i.location ? ` at ${i.location}` : ''}.`; },
  }),
  update_episode_status: tool({
    description: 'Update one step of an episode on the status board.',
    input: z.object({ productionId: id, episodeNumber: z.number().int().positive(), step: z.enum(BOARD_STEPS), status: z.enum(STEP_STATUSES) }),
    json: obj({ productionId: PID, episodeNumber: { type: 'integer' }, step: str('Board step', { enum: BOARD_STEPS }), status: str('New status', { enum: STEP_STATUSES }) }, ['productionId', 'episodeNumber', 'step', 'status']),
    run: async (i) => {
      const episode = await Episode.findOneAndUpdate({ productionId: i.productionId, number: i.episodeNumber }, { [`board.${i.step}`]: i.status });
      if (!episode) throw new HttpError(404, `Episode ${i.episodeNumber} has no row on the board yet`);
      return `Episode ${i.episodeNumber} ${i.step} is now ${i.status.replace('_', ' ')}.`;
    },
  }),
  approve_expense: tool({
    description: 'Approve a submitted expense sheet at the requested amounts.',
    input: z.object({ sheetId: id }),
    json: obj({ sheetId: str('The expense sheet id from the context') }, ['sheetId']),
    confirm: true,
    adminOnly: true,
    summarise: async (i) => {
      const sheet = await ExpenseSheet.findById(i.sheetId).lean();
      if (!sheet) throw new HttpError(404, 'Expense sheet not found');
      return `Approve expense sheet for shoot day ${sheet.shootDay ?? '?'}, PKR ${sheetTotals(sheet).requested.toLocaleString('en-PK')} across ${sheet.items.length} line items`;
    },
    run: async (i, user) => { const s = await decideSheet(i.sheetId, 'approve', {}, user, 'dreamer'); return `Approved PKR ${sheetTotals(s).approved.toLocaleString('en-PK')}.`; },
  }),
};

const anthropicTools: Anthropic.Tool[] = Object.entries(TOOLS).map(([name, t]) => ({ name, description: t.description, input_schema: t.json }));

async function systemPrompt(user: AuthUser) {
  const [rows, pending] = await Promise.all([
    portfolio({ status: { $in: ['active', 'on_hold'] } }),
    ExpenseSheet.find({ status: 'submitted' }).sort({ submittedAt: 1 }).limit(30).lean(),
  ]);
  return `You are Dreamer, the production-intelligence assistant inside Scene OS, used by Pakistani drama production teams.
Today is ${new Date().toDateString()}. You are talking to ${user.name} (${user.role}).

Rules:
- Answer only from the data below or from tool results. If something is not in the data, say so. Never invent figures.
- Lead with the answer. Keep it short and plain. Amounts are in PKR.
- Some actions wait for the person to confirm in the interface. When a tool result says it is waiting, tell them it needs their confirmation and never say it is done.
- Final creative, financial and production decisions belong to people.

Productions:
${JSON.stringify(rows)}

Expense sheets waiting for approval:
${JSON.stringify(pending.map((s) => ({ sheetId: s._id, productionId: s.productionId, shootDay: s.shootDay, shootDate: s.shootDate, lineProducer: s.lineProducer, ...sheetTotals(s) })))}`;
}

type Display =
  | { kind: 'user' | 'assistant'; text: string }
  | { kind: 'action'; name: string; ok: boolean; summary: string }
  | { kind: 'confirm'; name: string; summary: string };

export async function sendMessage(chatId: string | undefined, text: string, user: AuthUser) {
  const chat = chatId ? await DreamerChat.findOne({ _id: chatId, userId: user.id }) : new DreamerChat({ userId: user.id, title: text.slice(0, 80) });
  if (!chat) throw new HttpError(404, 'Conversation not found');
  if (chat.pendingAction) throw new HttpError(409, 'Confirm or cancel the waiting action first');

  const messages = chat.messages as Anthropic.MessageParam[];
  const display = chat.display as Display[];
  messages.push({ role: 'user', content: text });
  display.push({ kind: 'user', text });
  const system = await systemPrompt(user);

  for (let turn = 0; turn < 6; turn++) {
    const res = await claude().messages.create({ model: env.ANTHROPIC_MODEL, max_tokens: 2000, system, tools: anthropicTools, messages });
    messages.push({ role: 'assistant', content: res.content });
    const said = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n').trim();
    if (said) display.push({ kind: 'assistant', text: said });

    const calls = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    if (!calls.length) break;

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const call of calls) {
      results.push({ type: 'tool_result', tool_use_id: call.id, ...(await handleCall(call, user, chat, display)) });
    }
    messages.push({ role: 'user', content: results });
  }
  chat.markModified('messages');
  chat.markModified('display');
  await chat.save();
  return view(chat);
}

async function handleCall(call: Anthropic.ToolUseBlock, user: AuthUser, chat: InstanceType<typeof DreamerChat>, display: Display[]): Promise<{ content: string; is_error?: boolean }> {
  const def = TOOLS[call.name];
  if (!def) return { content: 'Unknown tool', is_error: true };
  try {
    const input = def.input.parse(call.input);
    if (def.adminOnly && user.role !== 'admin') {
      display.push({ kind: 'action', name: call.name, ok: false, summary: 'Only admins can do this' });
      return { content: 'Refused: this person is not an admin, so they cannot do this.', is_error: true };
    }
    if (def.confirm) {
      if (chat.pendingAction) return { content: 'Another action is already waiting for confirmation. Ask for one at a time.', is_error: true };
      const summary = (await def.summarise?.(input)) ?? call.name;
      chat.pendingAction = { name: call.name, input, summary };
      display.push({ kind: 'confirm', name: call.name, summary });
      return { content: 'Waiting for the person to confirm in the interface. It has NOT been done.' };
    }
    const summary = await def.run(input, user);
    if (call.name !== 'list_productions') {
      display.push({ kind: 'action', name: call.name, ok: true, summary });
      await audit(user, `dreamer.${call.name}`, { via: 'dreamer', detail: input });
    }
    return { content: summary };
  } catch (err) {
    const message = err instanceof HttpError ? err.message : err instanceof z.ZodError ? 'The details for this action were incomplete' : 'The action failed';
    if (!(err instanceof HttpError) && !(err instanceof z.ZodError)) console.error(err);
    display.push({ kind: 'action', name: call.name, ok: false, summary: message });
    return { content: `Failed: ${message}`, is_error: true };
  }
}

/** Runs or cancels the action that was waiting. The role is checked again here, at the moment it runs. */
export async function resolvePending(chatId: string, accept: boolean, user: AuthUser) {
  const chat = await DreamerChat.findOne({ _id: chatId, userId: user.id });
  if (!chat) throw new HttpError(404, 'Conversation not found');
  const pending = chat.pendingAction as { name: string; input: unknown; summary: string } | null;
  if (!pending) throw new HttpError(409, 'Nothing is waiting for confirmation');
  const def = TOOLS[pending.name];
  const display = chat.display as Display[];
  let outcome: string;
  if (!accept) {
    outcome = 'Cancelled. Nothing was changed.';
    display.push({ kind: 'action', name: pending.name, ok: false, summary: outcome });
  } else {
    if (def.adminOnly && user.role !== 'admin') throw new HttpError(403, 'Only admins can do this');
    outcome = await def.run(def.input.parse(pending.input), user);
    display.push({ kind: 'action', name: pending.name, ok: true, summary: outcome });
  }
  (chat.messages as Anthropic.MessageParam[]).push({ role: 'user', content: `[Interface note] "${pending.summary}": ${outcome}` });
  chat.pendingAction = null;
  chat.markModified('messages');
  chat.markModified('display');
  await chat.save();
  return view(chat);
}

export const view = (chat: InstanceType<typeof DreamerChat>) => ({
  id: String(chat._id),
  title: chat.title,
  display: chat.display,
  pendingAction: chat.pendingAction ? { name: (chat.pendingAction as { name: string }).name, summary: (chat.pendingAction as { summary: string }).summary } : null,
  updatedAt: chat.get('updatedAt') as Date,
});

export async function reportContext() {
  return JSON.stringify(await portfolio({ status: { $in: ['active', 'on_hold'] } }));
}
