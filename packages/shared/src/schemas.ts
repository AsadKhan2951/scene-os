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
  stylePreset: z.enum(c.STYLE_PRESETS).default('pakistani_serial'),
  country: z.string().max(100).optional(),
  /** The language of the dialogue, as people say it: "Urdu", "English", "Arabic". */
  language: z.string().max(60).optional(),
  currency: z.string().length(3).optional(),
  stageFlow: z.enum(c.STAGE_FLOWS).default('pakistani_15'),
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
  role: z.enum(c.CHARACTER_ROLES).optional(),
  backstory: z.string().max(2000).optional(),
  want: z.string().max(1000).optional(),
  need: z.string().max(1000).optional(),
  arc: z.string().max(2000).optional(),
  voice: z.string().max(1000).optional(),
  relationships: z.string().max(2000).optional(),
  physical: z.string().max(1000).optional(),
  looks: z.array(z.object({
    name: z.string().min(1).max(200),
    sceneFrom: z.number().int().positive().optional(),
    sceneTo: z.number().int().positive().optional(),
    note: z.string().max(500).optional(),
    items: z.array(z.object({ name: z.string().min(1).max(200), color: z.string().max(20).optional() })).max(20).default([]),
  })).max(20).optional(),
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
  /** The director's continuity decisions for this frame. The scene video is built from them. */
  cast: z.array(z.object({ name: z.string().min(1).max(100), wardrobe: z.string().max(400).default(''), facing: z.string().max(100).default('') })).max(6).optional(),
  location: z.string().max(400).optional(),
  light: z.string().max(300).optional(),
  lens: z.string().max(100).optional(),
  camera: z.string().max(200).optional(),
  props: z.string().max(300).optional(),
});

/** Input shape: fields with a default (style, stage flow, budget) may be left out. */
export type ProductionCreate = z.input<typeof productionCreateSchema>;
export type ExpenseSheetInput = z.infer<typeof expenseSheetSchema>;

// ---- Actor database ----
export const AVAILABILITY_KINDS = ['booked', 'hold', 'unavailable'] as const;
export const actorSchema = z.object({
  productionId: id,
  name: z.string().min(1).max(200),
  character: z.string().max(200).optional(),
  roleType: z.enum(['lead', 'supporting', 'antagonist', 'minor', 'extra']).default('supporting'),
  agent: z.string().max(200).optional(),
  phone: z.string().max(40).optional(),
  email: z.string().email().optional().or(z.literal('')),
  dayRate: money.optional(),
  currency: z.string().max(8).optional(),
  notes: z.string().max(2000).optional(),
  availability: z.array(z.object({
    start: date,
    end: date,
    kind: z.enum(AVAILABILITY_KINDS),
    note: z.string().max(300).optional(),
  })).max(50).default([]),
});
export const actorGenerateSchema = z.object({ productionId: id, count: z.number().int().min(1).max(20).default(8) });

// ---- Locations (Google Places) ----
export const LOCATION_STATUSES = ['candidate', 'locked'] as const;
export const locationSearchSchema = z.object({ productionId: id, query: z.string().min(2).max(200), region: z.string().max(10).optional() });
export const locationSchema = z.object({
  productionId: id,
  scriptName: z.string().max(200).optional(),
  name: z.string().min(1).max(300),
  placeId: z.string().max(300).optional(),
  address: z.string().max(500).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  mapsUri: z.string().max(1000).optional(),
  photoNames: z.array(z.string().max(500)).max(10).default([]),
  types: z.array(z.string().max(100)).max(20).default([]),
  rating: z.number().optional(),
  notes: z.string().max(2000).optional(),
  costPerDay: money.optional(),
  permitDays: z.number().int().min(0).max(365).optional(),
  currency: z.string().max(8).optional(),
});
export const creditGrantSchema = z.object({ credits: z.number().positive().max(1_000_000), note: z.string().max(300).optional() });
export const creditSettingsSchema = z.object({
  monthlyCredits: z.number().int().min(0).max(10_000_000).optional(),
  markup: z.number().min(1).max(20).optional(),
  hardLimit: z.boolean().optional(),
});
