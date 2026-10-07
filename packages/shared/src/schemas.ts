import { z } from 'zod';
import * as c from './constants';

const id = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');
const date = z.coerce.date();
const money = z.number().nonnegative();

export const loginSchema = z.object({ email: z.string().email(), password: z.string().min(8) });

export const productionCreateSchema = z.object({
  title: z.string().min(1).max(200),
  format: z.enum(c.PRODUCTION_FORMATS),
  genre: z.string().max(100).optional(),
  writer: z.string().max(200).optional(),
  director: z.string().max(200).optional(),
  channel: z.string().max(200).optional(),
  totalEpisodes: z.number().int().min(1).max(500),
  totalBudget: money.default(0),
});
export const productionUpdateSchema = productionCreateSchema.partial().extend({
  status: z.enum(c.PRODUCTION_STATUSES).optional(),
  deliveryRequirements: z.array(z.string().min(1).max(200)).max(30).optional(),
});
export const stageAdvanceSchema = z.object({ note: z.string().max(2000).optional() });

export const episodeUpdateSchema = z.object({
  title: z.string().max(200).optional(),
  totalScenes: z.number().int().min(0).optional(),
  recordedScenes: z.number().int().min(0).optional(),
  board: z.record(z.enum(c.BOARD_STEPS), z.enum(c.STEP_STATUSES)).optional(),
  airDate: date.nullable().optional(),
  notes: z.string().max(4000).optional(),
  deliveryItems: z.array(z.object({ label: z.string(), status: z.enum(c.STEP_STATUSES) })).optional(),
  deliveryNote: z.string().max(4000).optional(),
});

export const milestoneSchema = z.object({
  productionId: id,
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  category: z.enum(c.MILESTONE_CATEGORIES),
  dueDate: date,
  status: z.enum(c.MILESTONE_STATUSES).default('pending'),
  assignee: z.string().max(200).optional(),
});

export const personSchema = z.object({
  productionId: id,
  name: z.string().min(1).max(200),
  role: z.string().min(1).max(200),
  department: z.enum(c.DEPARTMENTS),
  phone: z.string().max(40).optional(),
  email: z.string().email().optional().or(z.literal('')),
  availability: z.enum(c.AVAILABILITY).default('available'),
  contractStatus: z.enum(c.CONTRACT_STATUSES).default('pending'),
  notes: z.string().max(2000).optional(),
});

export const documentSchema = z.object({
  productionId: id,
  title: z.string().min(1).max(200),
  type: z.enum(c.DOCUMENT_TYPES),
  fileName: z.string().min(1).max(300),
  fileSize: z.number().int().nonnegative(),
  mimeType: z.string().max(200),
  storageKey: z.string().min(1),
});
export const presignSchema = z.object({ productionId: id, fileName: z.string().min(1).max(300), mimeType: z.string().max(200) });

export const weeklyPlanSchema = z.object({
  productionId: id,
  startDate: date,
  endDate: date,
  days: z.array(z.object({
    date,
    shootDay: z.number().int().positive().optional(),
    location: z.string().max(200).optional(),
    talent: z.string().max(500).optional(),
    callTime: z.string().max(20).optional(),
    offDay: z.boolean().default(false),
    notes: z.string().max(1000).optional(),
  })).max(14),
});

export const callSheetSchema = z.object({
  productionId: id,
  shootDate: date,
  shootDay: z.number().int().positive().optional(),
  location: z.string().max(200).optional(),
  generalCall: z.string().max(20).optional(),
  director: z.string().max(200).optional(),
  lineProducer: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
  status: z.enum(c.CALL_SHEET_STATUSES).default('draft'),
  entries: z.array(z.object({
    type: z.enum(c.CALL_ENTRY_TYPES),
    name: z.string().min(1).max(200),
    role: z.string().max(200).optional(),
    callTime: z.string().max(20).optional(),
    notes: z.string().max(500).optional(),
    order: z.number().int().default(0),
  })).default([]),
});

export const expenseItemSchema = z.object({
  category: z.enum(c.EXPENSE_CATEGORIES),
  note: z.string().max(500).optional(),
  requested: money,
});
export const expenseSheetSchema = z.object({
  productionId: id,
  shootDate: date,
  shootDay: z.number().int().positive().optional(),
  lineProducer: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
  items: z.array(expenseItemSchema).min(1).max(100),
});
export const expenseDecisionSchema = z.object({
  comment: z.string().max(2000).optional(),
  /** approved amount per item id; items left out are approved as requested */
  approved: z.record(id, money).optional(),
});
export const commentSchema = z.object({ text: z.string().min(1).max(2000) });

export const storySchema = z.object({
  productionId: id.optional(),
  title: z.string().min(1).max(200),
  format: z.enum(c.WRITING_FORMATS),
  language: z.enum(c.LANGUAGES),
  answers: z.array(z.object({ question: z.string(), answer: z.string() })).default([]),
});
export const storyUpdateSchema = storySchema.partial().extend({
  oneLiner: z.string().max(20000).optional(),
  locked: z.boolean().optional(),
});
export const scriptEpisodeSchema = z.object({
  title: z.string().max(200).optional(),
  outline: z.string().max(4000).optional(),
  content: z.string().max(400000).optional(),
  status: z.enum(c.SCRIPT_EPISODE_STATUSES).optional(),
});

export const characterSchema = z.object({
  storyId: id,
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  ageRange: z.string().max(40).optional(),
  familyGroup: z.string().max(200).optional(),
  actorOptions: z.array(z.object({ name: z.string().min(1).max(200), note: z.string().max(500).optional() })).default([]),
  finalCast: z.string().max(200).nullable().optional(),
});

const score = z.number().int().min(1).max(5);
export const reviewSchema = z.object({
  productionId: id,
  episodeNumber: z.number().int().positive(),
  reviewer: z.string().min(1).max(200),
  scores: z.record(z.enum(c.REVIEW_FIELDS), score),
  suggestions: z.string().max(4000).optional(),
});
export const evaluationSchema = z.object({
  usp: z.string().max(4000).optional(),
  promotionalApproach: z.string().max(4000).optional(),
  relatability: z.string().max(4000).optional(),
  fearFantasy: z.string().max(4000).optional(),
});

export const dreamerMessageSchema = z.object({ chatId: id.optional(), message: z.string().min(1).max(4000) });
export const reportSchema = z.object({ type: z.enum(['daily', 'weekly', 'monthly']) });
export const storyboardGenerateSchema = z.object({ scriptEpisodeId: id, sceneNumber: z.number().int().positive() });
export const frameUpdateSchema = z.object({
  status: z.enum(['approved', 'needs_review']).optional(),
  redrawNote: z.string().max(1000).optional(),
});

export type ProductionCreate = z.infer<typeof productionCreateSchema>;
export type ExpenseSheetInput = z.infer<typeof expenseSheetSchema>;
