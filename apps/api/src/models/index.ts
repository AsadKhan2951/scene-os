import { Schema, model, type InferSchemaType, type Types } from 'mongoose';
import * as c from '@sceneos/shared';

const ref = (name: string, required = true) => ({ type: Schema.Types.ObjectId, ref: name, required, index: true });
const opts = { timestamps: true } as const;
const stepStatus = { type: String, enum: c.STEP_STATUSES, default: 'pending' } as const;

// ---- Users ----
const userSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: c.ROLES, default: 'user' },
}, opts);
export const User = model('User', userSchema);

// ---- Productions: the 15 Pakistani serial stages or the 6 international ones, embedded ----
const stageSchema = new Schema({
  order: { type: Number, required: true },
  name: { type: String, required: true },
  phase: { type: String, enum: c.PHASES, required: true },
  status: { type: String, enum: c.STAGE_STATUSES, default: 'pending' },
  startedAt: Date,
  completedAt: Date,
  note: String,
}, { _id: false });
const productionSchema = new Schema({
  title: { type: String, required: true, index: true },
  format: { type: String, enum: c.PRODUCTION_FORMATS, required: true },
  genre: String,
  writer: String,
  director: String,
  channel: String,
  totalEpisodes: { type: Number, required: true },
  totalBudget: { type: Number, default: 0 },
  /** Scene OS 2.0: how pictures and plans look, where it is set, the dialogue language, money, stage flow. */
  stylePreset: { type: String, enum: c.STYLE_PRESETS, default: 'pakistani_serial' },
  country: { type: String, default: 'Pakistan' },
  language: { type: String, default: 'Urdu' },
  currency: { type: String, default: 'PKR' },
  stageFlow: { type: String, enum: c.STAGE_FLOWS, default: 'pakistani_15' },
  status: { type: String, enum: c.PRODUCTION_STATUSES, default: 'active', index: true },
  currentStage: { type: Number, default: 1 },
  stages: { type: [stageSchema], default: [] },
  deliveryRequirements: { type: [String], default: [] },
  createdBy: ref('User', false),
}, opts);
export const Production = model('Production', productionSchema);
export type ProductionDoc = InferSchemaType<typeof productionSchema> & { _id: Types.ObjectId };

// ---- Episodes: scene tracking and the post/delivery status board in one row ----
const episodeSchema = new Schema({
  productionId: ref('Production'),
  number: { type: Number, required: true },
  title: String,
  totalScenes: { type: Number, default: 0 },
  recordedScenes: { type: Number, default: 0 },
  board: {
    script: stepStatus, shoot: stepStatus, offlineEdit: stepStatus, onlineEdit: stepStatus,
    sound: stepStatus, qc: stepStatus, delivery: stepStatus,
  },
  airDate: Date,
  notes: String,
  deliveryItems: { type: [new Schema({ label: String, status: stepStatus }, { _id: false })], default: [] },
  deliveryNote: String,
  deliveredAt: Date,
}, opts);
episodeSchema.index({ productionId: 1, number: 1 }, { unique: true });
export const Episode = model('Episode', episodeSchema);

// ---- Writers Hub ----
const storySchema = new Schema({
  productionId: ref('Production', false),
  title: { type: String, required: true },
  format: { type: String, enum: c.WRITING_FORMATS, required: true },
  language: { type: String, enum: c.LANGUAGES, default: 'roman_urdu' },
  answers: { type: [new Schema({ question: String, answer: String }, { _id: false })], default: [] },
  oneLiner: { type: String, default: '' },
  locked: { type: Boolean, default: false },
  lockedAt: Date,
  createdBy: ref('User', false),
  // ---- Script Director (intake) ----
  logline: String,
  genre: String,
  /** The script file this story was read from. */
  sourceFile: { name: String, format: String, importedAt: Date },
  stats: { scenes: Number, characters: Number, mainCharacters: Number, locations: Number, pages: Number, runtimeMinutes: Number },
  coverage: {
    structure: Number, characters: Number, pacing: Number, dialogue: Number,
    verdict: { type: String, enum: ['pass', 'consider', 'recommend'] },
    summary: String,
    notes: { type: [new Schema({ text: String, scenes: [Number] }, { _id: false })], default: undefined },
    at: Date,
  },
}, opts);
export const Story = model('Story', storySchema);

/** An uploaded script file, kept until it has been read (PDFs are read by AI in the intake run). */
const scriptFileSchema = new Schema({
  storyId: ref('Story'),
  name: { type: String, required: true },
  format: { type: String, required: true },
  size: Number,
  data: { type: Buffer, required: true, select: false },
}, opts);
export const ScriptFile = model('ScriptFile', scriptFileSchema);

/** Scenes as parsed from the script: the base for breakdown, locations and the shoot plan. */
const sceneSchema = new Schema({
  storyId: ref('Story'),
  scriptEpisodeId: ref('ScriptEpisode', false),
  number: { type: Number, required: true },
  heading: String,
  intExt: String,
  location: String,
  time: String,
  /** Page length in eighths of a page. */
  eighths: { type: Number, default: 0 },
  characters: { type: [String], default: [] },
  // ---- Breakdown (Production) ----
  synopsis: String,
  elements: { type: [new Schema({ category: { type: String, enum: c.BREAKDOWN_CATEGORIES }, name: String, qty: Number }, { _id: false })], default: [] },
  brokenDownAt: Date,
  /** The real shoot location this scene is filmed at (locations grouped from the script). */
  locationId: { type: Schema.Types.ObjectId, ref: 'Location' },
}, opts);
sceneSchema.index({ storyId: 1, scriptEpisodeId: 1, number: 1 }, { unique: true });
export const Scene = model('Scene', sceneSchema);

const scriptEpisodeSchema = new Schema({
  storyId: ref('Story'),
  number: { type: Number, required: true },
  title: String,
  outline: String,
  content: { type: String, default: '' },
  status: { type: String, enum: c.SCRIPT_EPISODE_STATUSES, default: 'planned' },
  revisions: { type: [new Schema({ label: String, content: String, by: String, at: Date }, { _id: false })], default: [] },
}, opts);
scriptEpisodeSchema.index({ storyId: 1, number: 1 }, { unique: true });
export const ScriptEpisode = model('ScriptEpisode', scriptEpisodeSchema);

const characterSchema = new Schema({
  storyId: ref('Story'),
  name: { type: String, required: true },
  description: String,
  ageRange: String,
  familyGroup: String,
  actorOptions: { type: [new Schema({ name: String, note: String }, { _id: false })], default: [] },
  finalCast: { type: String, default: null },
  /** The AI face chosen for this character the first time a video was made. Reused in every later scene. */
  look: String,
  lookImageUrl: String,
  /** Trained Higgsfield Soul ID for this face. */
  soulId: String,
  // ---- Script Director: found in the script, then characterised by AI ----
  role: { type: String, enum: c.CHARACTER_ROLES },
  sceneCount: Number,
  lineCount: Number,
  firstScene: Number,
  backstory: String,
  want: String,
  need: String,
  arc: String,
  voice: String,
  relationships: String,
  physical: String,
  /** Costume looks across the script, each for a run of scenes. */
  looks: { type: [new Schema({
    name: String, sceneFrom: Number, sceneTo: Number, note: String,
    items: { type: [new Schema({ name: String, color: String }, { _id: false })], default: [] },
  }, { _id: false })], default: [] },
  /** A locked character is never rewritten by AI. */
  locked: { type: Boolean, default: false },
  lockedAt: Date,
  /** Where the character came from: typed by a writer or found in an imported script. */
  source: { type: String, enum: ['manual', 'script'], default: 'manual' },
}, opts);
export const Character = model('Character', characterSchema);

const frameSchema = new Schema({
  scriptEpisodeId: ref('ScriptEpisode'),
  sceneNumber: { type: Number, required: true },
  order: { type: Number, required: true },
  shot: String,
  action: String,
  dialogue: String,
  prompt: String,
  /** Continuity sheet: who is in the frame, what they wear and how they face the camera, plus place, light and camera. */
  cast: { type: [new Schema({ name: String, wardrobe: String, facing: String }, { _id: false })], default: [] },
  location: String,
  light: String,
  lens: String,
  camera: String,
  props: String,
  imageUrl: String,
  status: { type: String, enum: c.FRAME_STATUSES, default: 'queued' },
  redrawNote: String,
  error: String,
  /** Motion clip made from the approved frame image. */
  videoUrl: String,
  videoStatus: { type: String, enum: ['none', 'queued', 'drawing', 'ready', 'failed'], default: 'none' },
  videoError: String,
  /** False while files still live on Higgsfield, which only keeps them for a limited time. */
  filesPermanent: { type: Boolean, default: false },
}, opts);
export const StoryboardFrame = model('StoryboardFrame', frameSchema);

// ---- Teasers: a short realistic promo cut from the story ----
const teaserSchema = new Schema({
  storyId: ref('Story'),
  /** Set when the video is one storyboard scene, shot for shot. Empty for a story teaser. */
  scriptEpisodeId: ref('ScriptEpisode', false),
  sceneNumber: Number,
  sceneHeading: String,
  durationSeconds: { type: Number, required: true },
  tone: { type: String, enum: c.TEASER_TONES, required: true },
  music: { type: String, enum: c.TEASER_MUSIC, required: true },
  musicNotes: String,
  voiceOver: { type: Boolean, default: true },
  voice: { type: String, enum: c.TEASER_VOICES, default: 'female' },
  voiceLanguage: { type: String, enum: c.TEASER_VOICE_LANGUAGES, default: 'urdu' },
  endLine: String,
  sceneBible: { type: String, default: '' },
  /** refImageUrl is the casting photo every shot of this person is drawn from. */
  characters: { type: [new Schema({ name: String, person: String, look: String, refImageUrl: String, soulId: String }, { _id: false })], default: [] },
  shots: { type: [new Schema({
    visual: String, motion: String, cast: { type: [String], default: [] }, imageUrl: String, clipUrl: String,
    status: { type: String, enum: ['waiting', 'image', 'clip', 'done', 'failed'], default: 'waiting' },
    error: String,
  }, { _id: false })], default: [] },
  voiceOverScript: { type: String, default: '' },
  musicPrompt: { type: String, default: '' },
  status: { type: String, enum: c.TEASER_STATUSES, default: 'planned' },
  step: String,
  error: String,
  /** What went into the finished file, so the screen can say when sound is missing. */
  result: { hasVoiceOver: Boolean, hasMusic: Boolean, notes: [String], renderedAt: Date },
  createdBy: String,
}, opts);
export const Teaser = model('Teaser', teaserSchema);

// ---- Schedule ----
const weeklyPlanSchema = new Schema({
  productionId: ref('Production'),
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  days: { type: [new Schema({
    date: Date, shootDay: Number, location: String, talent: String, callTime: String,
    offDay: { type: Boolean, default: false }, notes: String,
  }, { _id: false })], default: [] },
}, opts);
export const WeeklyPlan = model('WeeklyPlan', weeklyPlanSchema);

const callSheetSchema = new Schema({
  productionId: ref('Production'),
  shootDate: { type: Date, required: true },
  shootDay: Number,
  location: String,
  generalCall: String,
  director: String,
  lineProducer: String,
  notes: String,
  status: { type: String, enum: c.CALL_SHEET_STATUSES, default: 'draft' },
  entries: { type: [new Schema({
    type: { type: String, enum: c.CALL_ENTRY_TYPES }, name: String, role: String,
    callTime: String, notes: String, order: { type: Number, default: 0 },
  }, { _id: false })], default: [] },
}, opts);
export const CallSheet = model('CallSheet', callSheetSchema);

// ---- People, milestones, documents ----
const personSchema = new Schema({
  productionId: ref('Production'),
  name: { type: String, required: true },
  role: { type: String, required: true },
  department: { type: String, enum: c.DEPARTMENTS, required: true },
  phone: String,
  email: String,
  availability: { type: String, enum: c.AVAILABILITY, default: 'available' },
  contractStatus: { type: String, enum: c.CONTRACT_STATUSES, default: 'pending' },
  notes: String,
}, opts);
export const Person = model('Person', personSchema);

const milestoneSchema = new Schema({
  productionId: ref('Production'),
  title: { type: String, required: true },
  description: String,
  category: { type: String, enum: c.MILESTONE_CATEGORIES, required: true },
  dueDate: { type: Date, required: true },
  status: { type: String, enum: c.MILESTONE_STATUSES, default: 'pending' },
  assignee: String,
  completedAt: Date,
}, opts);
export const Milestone = model('Milestone', milestoneSchema);

const documentSchema = new Schema({
  productionId: ref('Production'),
  title: { type: String, required: true },
  type: { type: String, enum: c.DOCUMENT_TYPES, required: true },
  fileName: { type: String, required: true },
  fileSize: Number,
  mimeType: String,
  storageKey: { type: String, required: true },
  uploadedBy: String,
}, opts);
export const ProductionDocument = model('Document', documentSchema);

// ---- Expenses ----
const expenseSheetSchema = new Schema({
  productionId: ref('Production'),
  shootDate: { type: Date, required: true },
  shootDay: Number,
  lineProducer: String,
  notes: String,
  status: { type: String, enum: c.EXPENSE_STATUSES, default: 'draft', index: true },
  items: { type: [new Schema({
    category: { type: String, enum: c.EXPENSE_CATEGORIES, required: true },
    note: String,
    requested: { type: Number, required: true },
    approved: { type: Number, default: null },
  })], default: [] },
  comments: { type: [new Schema({ by: String, text: String, action: String, at: { type: Date, default: Date.now } }, { _id: false })], default: [] },
  submittedBy: ref('User', false),
  submittedAt: Date,
  decidedBy: String,
  decidedAt: Date,
}, opts);
export const ExpenseSheet = model('ExpenseSheet', expenseSheetSchema);

// ---- Reviews and evaluation ----
const reviewSchema = new Schema({
  productionId: ref('Production'),
  episodeNumber: { type: Number, required: true },
  reviewer: { type: String, required: true },
  scores: { type: Map, of: Number, default: {} },
  suggestions: String,
}, opts);
export const Review = model('Review', reviewSchema);

const signOff = { by: String, at: Date };
const evaluationSchema = new Schema({
  productionId: { ...ref('Production'), unique: true },
  usp: String,
  promotionalApproach: String,
  relatability: String,
  fearFantasy: String,
  signOffs: { producer: signOff, channelHead: signOff, ceo: signOff },
}, opts);
export const Evaluation = model('Evaluation', evaluationSchema);

// ---- Dreamer ----
const dreamerChatSchema = new Schema({
  userId: ref('User'),
  title: String,
  /** Raw Anthropic message history, kept so a conversation can continue. */
  messages: { type: [Schema.Types.Mixed], default: [] },
  /** What the person sees: text, completed actions and actions waiting for confirmation. */
  display: { type: [Schema.Types.Mixed], default: [] },
  pendingAction: { type: Schema.Types.Mixed, default: null },
}, opts);
export const DreamerChat = model('DreamerChat', dreamerChatSchema);

const reportSchema = new Schema({
  type: { type: String, enum: ['daily', 'weekly', 'monthly'], required: true },
  content: { type: String, required: true },
  createdBy: String,
}, opts);
export const Report = model('Report', reportSchema);

// ---- Audit trail for approvals, stage changes and sign-offs ----
const auditSchema = new Schema({
  action: { type: String, required: true, index: true },
  by: String,
  via: { type: String, enum: ['user', 'dreamer'], default: 'user' },
  productionId: ref('Production', false),
  targetId: String,
  detail: Schema.Types.Mixed,
}, { timestamps: { createdAt: true, updatedAt: false } });
export const AuditLog = model('AuditLog', auditSchema);

// ---- AI credits and metering ----
/** One per workspace. Until organisations exist there is a single workspace, "default". */
const creditAccountSchema = new Schema({
  orgId: { type: String, required: true, unique: true },
  /** Credits left. Can go slightly below zero when a running job finishes over its quote. */
  balance: { type: Number, default: 0 },
  /** Credits set aside for jobs that are running. Available = balance - held. */
  held: { type: Number, default: 0 },
  monthlyCredits: { type: Number, default: c.DEFAULT_MONTHLY_CREDITS },
  markup: { type: Number, default: c.DEFAULT_MARKUP },
  /** When true an action that does not fit in the available credits is refused before it starts. */
  hardLimit: { type: Boolean, default: true },
  /** The month (YYYY-MM) the monthly credits were last given for. */
  periodKey: String,
}, opts);
export const CreditAccount = model('CreditAccount', creditAccountSchema);

/** Append-only. Nothing here is edited or deleted, so every credit can be traced to a call. */
const creditLedgerSchema = new Schema({
  orgId: { type: String, required: true, index: true },
  kind: { type: String, enum: c.LEDGER_KINDS, required: true },
  /** Positive for grants and releases, negative for debits and holds. */
  credits: { type: Number, required: true },
  balanceAfter: Number,
  heldAfter: Number,
  runId: { type: String, index: true },
  usageEventId: { type: Schema.Types.ObjectId, ref: 'UsageEvent' },
  userId: String,
  note: String,
}, { timestamps: { createdAt: true, updatedAt: false } });
export const CreditLedger = model('CreditLedger', creditLedgerSchema);

/** Credits set aside for one run (a storyboard scene, a scene video). Released when the run ends. */
const creditHoldSchema = new Schema({
  orgId: { type: String, required: true },
  runId: { type: String, required: true, unique: true },
  action: String,
  amount: { type: Number, required: true },
  /** Debits charged against this hold so far. */
  used: { type: Number, default: 0 },
  status: { type: String, enum: ['open', 'released'], default: 'open', index: true },
  userId: String,
  releasedAt: Date,
}, opts);
export const CreditHold = model('CreditHold', creditHoldSchema);

/** One per provider call: what was used, what it cost, what it was charged. */
const usageEventSchema = new Schema({
  orgId: { type: String, required: true, index: true },
  userId: { type: String, index: true },
  userName: String,
  productionId: { type: String, index: true },
  storyId: String,
  feature: { type: String, enum: c.AI_FEATURES, default: 'other', index: true },
  action: String,
  runId: { type: String, index: true },
  provider: { type: String, enum: ['anthropic', 'higgsfield', 'elevenlabs', 'google'], required: true },
  model: String,
  /** Claude token counts, straight from the API's usage field. */
  inputTokens: Number,
  outputTokens: Number,
  cacheCreationTokens: Number,
  cacheReadTokens: Number,
  /** Media and other providers: what was made and how much of it. */
  unit: String,
  quantity: Number,
  costUsd: { type: Number, required: true },
  credits: { type: Number, required: true },
  markup: Number,
  rateVersion: String,
  latencyMs: Number,
  ok: { type: Boolean, default: true },
  error: String,
}, { timestamps: { createdAt: true, updatedAt: false } });
usageEventSchema.index({ orgId: 1, createdAt: -1 });
export const UsageEvent = model('UsageEvent', usageEventSchema);

// ---- Actor database ----
const actorSchema = new Schema({
  productionId: ref('Production'),
  name: { type: String, required: true },
  character: String,
  roleType: { type: String, enum: ['lead', 'supporting', 'antagonist', 'minor', 'extra'], default: 'supporting' },
  agent: String,
  phone: String,
  email: String,
  dayRate: Number,
  currency: String,
  notes: String,
  availability: { type: [new Schema({
    start: { type: Date, required: true },
    end: { type: Date, required: true },
    kind: { type: String, enum: c.AVAILABILITY_KINDS, required: true },
    note: String,
  }, { _id: false })], default: [] },
  /** "ai_sample" rows were made by AI as placeholders; replace them with real actors. */
  source: { type: String, enum: ['manual', 'ai_sample', 'import'], default: 'manual' },
}, opts);
export const Actor = model('Actor', actorSchema);

// ---- Locations from Google Places ----
const locationSchema = new Schema({
  productionId: ref('Production'),
  /** The place as the script names it, e.g. "EXT. MUSCAT SOUK - DAY". */
  scriptName: String,
  /** Script locations grouped into this one real place, and the scenes shot here. */
  storyId: { type: Schema.Types.ObjectId, ref: 'Story' },
  scriptNames: { type: [String], default: [] },
  sceneNumbers: { type: [Number], default: [] },
  description: String,
  /** Art board: palette and mood images the director signs off before scouting. */
  palette: { type: [String], default: [] },
  board: { type: [new Schema({ label: String, imageUrl: String }, { _id: false })], default: [] },
  /** Scouting and logistics. */
  logistics: { contact: String, power: String, unitBase: String, nearestHospital: String, shootDays: String },
  name: { type: String, required: true },
  placeId: String,
  address: String,
  lat: Number,
  lng: Number,
  mapsUri: String,
  /** Google photo resource names; the API turns them into image links on request. */
  photoNames: { type: [String], default: [] },
  types: { type: [String], default: [] },
  rating: Number,
  notes: String,
  costPerDay: Number,
  permitDays: Number,
  currency: String,
  /** True when cost or permit time came from AI, not from the team. */
  costIsEstimate: { type: Boolean, default: false },
  estimateNote: String,
  status: { type: String, enum: c.LOCATION_STATUSES, default: 'candidate' },
  lockedAt: Date,
}, opts);
export const Location = model('Location', locationSchema);

// ---- Durable AI runs (lib/runs): one per long pipeline, with its steps for the live checklist ----
const aiRunSchema = new Schema({
  orgId: { type: String, required: true, index: true },
  type: { type: String, required: true, index: true },
  title: String,
  status: { type: String, enum: ['queued', 'running', 'waiting', 'done', 'failed'], default: 'queued', index: true },
  productionId: { type: String, index: true },
  storyId: { type: String, index: true },
  input: { type: Schema.Types.Mixed, default: {} },
  steps: { type: [new Schema({
    key: String, label: String,
    status: { type: String, enum: ['pending', 'running', 'done', 'failed', 'waiting'], default: 'pending' },
    output: Schema.Types.Mixed, note: String, error: String, startedAt: Date, endedAt: Date,
  }, { _id: false })], default: [] },
  answers: { type: Schema.Types.Mixed, default: {} },
  waiting: { type: Schema.Types.Mixed, default: null },
  error: String,
  /** Credits are reserved per attempt with this action, and released when the attempt ends. */
  holdAction: String,
  holdMultiplier: { type: Number, default: 1 },
  createdBy: String,
  createdByName: String,
  finishedAt: Date,
}, opts);
export const AiRun = model('AiRun', aiRunSchema);

// ---- Shoot plan: the stripboard, from the scenes, locations and actor dates ----
const shootDaySchema = new Schema({
  number: { type: Number, required: true },
  date: Date,
  locationName: String,
  sceneIds: { type: [Schema.Types.ObjectId], default: [] },
  eighths: { type: Number, default: 0 },
  /** The unit moves to another location this day. */
  companyMove: { type: Boolean, default: false },
  travel: String,
  notes: String,
}, { _id: false });
const scheduleSchema = new Schema({
  productionId: ref('Production'),
  storyId: ref('Story'),
  startDate: { type: Date, required: true },
  /** Weekdays with no shooting, 0 = Sunday. */
  daysOff: { type: [Number], default: [] },
  maxEighthsPerDay: { type: Number, default: 40 },
  days: { type: [shootDaySchema], default: [] },
  conflicts: { type: [new Schema({ day: Number, actor: String, character: String, scene: Number, kind: String, note: String }, { _id: false })], default: [] },
  stats: { days: Number, companyMoves: Number, holdingDays: Number },
  explanation: String,
  itinerary: { type: [new Schema({ day: Number, time: String, title: String, detail: String }, { _id: false })], default: [] },
  status: { type: String, enum: ['draft', 'approved'], default: 'draft' },
  approvedBy: String,
  approvedAt: Date,
}, opts);
export const Schedule = model('Schedule', scheduleSchema);
