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

// ---- Productions (15 stages embedded) ----
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
}, opts);
export const Story = model('Story', storySchema);

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
