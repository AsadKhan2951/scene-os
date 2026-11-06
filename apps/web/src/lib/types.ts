import type { BoardStep, HealthResult, HealthSignals, Role } from '@sceneos/shared';

export interface Me { id: string; name: string; email: string; role: Role }
export interface Stage { order: number; name: string; phase: string; status: string; startedAt?: string; completedAt?: string; note?: string }
export interface Production {
  _id: string; title: string; format: string; genre?: string; writer?: string; director?: string; channel?: string;
  totalEpisodes: number; totalBudget: number; status: string; currentStage: number; stages: Stage[]; deliveryRequirements: string[];
  stylePreset?: string; country?: string; language?: string; currency?: string; stageFlow?: 'pakistani_15' | 'international';
}
export interface PortfolioRow {
  id: string; title: string; format: string; genre?: string; writer?: string; director?: string; channel?: string; status: string;
  totalEpisodes: number; currentStage: number; stageCount: number; stageName: string;
  scenes: { total: number; recorded: number; remaining: number };
  budget: { budget: number; approved: number; pending: number; remaining: number; usedPct: number | null; sheets: number };
  signals: HealthSignals; health: HealthResult;
}
export interface Episode {
  _id: string; number: number; title?: string; totalScenes: number; recordedScenes: number;
  board: Record<BoardStep, string>; airDate?: string; notes?: string;
  deliveryItems: { label: string; status: string }[]; deliveryNote?: string; deliveredAt?: string;
}
export interface ExpenseItem { _id: string; category: string; note?: string; requested: number; approved: number | null }
export interface ExpenseSheet {
  _id: string; productionId: { _id: string; title: string } | string; shootDate: string; shootDay?: number; lineProducer?: string; notes?: string;
  status: string; items: ExpenseItem[]; comments: { by: string; text: string; action: string; at: string }[]; submittedAt?: string;
}
export interface Milestone { _id: string; title: string; description?: string; category: string; dueDate: string; status: string; assignee?: string }
export interface Person { _id: string; name: string; role: string; department: string; phone?: string; email?: string; availability: string; contractStatus: string; notes?: string }
export interface Doc { _id: string; title: string; type: string; fileName: string; fileSize: number; createdAt: string }
export interface CallSheet {
  _id: string; productionId: { _id: string; title: string } | string; shootDate: string; shootDay?: number; location?: string; generalCall?: string;
  director?: string; lineProducer?: string; notes?: string; status: string;
  entries: { type: string; name: string; role?: string; callTime?: string; notes?: string; order: number }[];
}
export interface WeeklyPlan { _id: string; startDate: string; endDate: string; days: { date: string; shootDay?: number; location?: string; callTime?: string; offDay: boolean; notes?: string }[] }
export interface Story { _id: string; productionId?: string; title: string; format: string; language: string; answers: { question: string; answer: string }[]; oneLiner: string; locked: boolean; lockedAt?: string; logline?: string; genre?: string }
export interface ScriptEpisode { _id: string; number: number; title?: string; outline?: string; content: string; status: string; revisions: { label: string; by: string; at: string }[]; updatedAt: string }
export interface CostumeLook { name: string; sceneFrom?: number; sceneTo?: number; note?: string; items: { name: string; color?: string }[] }
export interface Character {
  _id: string; name: string; description?: string; ageRange?: string; familyGroup?: string; actorOptions: { name: string; note?: string }[]; finalCast: string | null;
  role?: 'lead' | 'supporting' | 'antagonist' | 'minor'; sceneCount?: number; lineCount?: number; firstScene?: number;
  backstory?: string; want?: string; need?: string; arc?: string; voice?: string; relationships?: string; physical?: string;
  looks?: CostumeLook[]; locked?: boolean; soulId?: string; lookImageUrl?: string; source?: 'manual' | 'script';
}
export interface Coverage { structure: number; characters: number; pacing: number; dialogue: number; verdict: 'pass' | 'consider' | 'recommend'; summary: string; notes: { text: string; scenes: number[] }[]; at: string }
export interface StoryOverview {
  story: Story & { logline?: string; genre?: string; sourceFile?: { name: string; format: string; importedAt: string }; stats?: { scenes: number; characters: number; mainCharacters: number; locations: number; pages: number; runtimeMinutes: number }; coverage?: Coverage };
  characters: Character[]; run: { _id: string; status: string; createdAt: string } | null; episodes: { number: number; status: string }[];
}
export interface FrameCast { name: string; wardrobe: string; facing: string }
export interface Frame { _id: string; sceneNumber: number; order: number; shot?: string; action?: string; dialogue?: string; cast?: FrameCast[]; location?: string; light?: string; lens?: string; camera?: string; props?: string; imageUrl?: string; status: string; error?: string; redrawNote?: string; videoUrl?: string; videoStatus?: string; videoError?: string; filesPermanent?: boolean;
  render?: { url?: string; status?: 'none' | 'queued' | 'drawing' | 'ready' | 'failed'; error?: string; preset?: string; lens?: string; camera?: string; light?: string; aspect?: string; prompt?: string; at?: string }; keyFrame?: boolean; scriptEpisodeId?: string }
export interface Review { _id: string; episodeNumber: number; reviewer: string; scores: Record<string, number>; suggestions?: string }
export interface Evaluation { usp?: string; promotionalApproach?: string; relatability?: string; fearFantasy?: string; signOffs?: Record<string, { by?: string; at?: string }> }
export type DreamerItem =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string }
  | { kind: 'action'; name: string; ok: boolean; summary: string }
  | { kind: 'confirm'; name: string; summary: string };
export interface DreamerChat { id: string; title?: string; display: DreamerItem[]; pendingAction: { name: string; summary: string } | null }
export interface TeaserShot { visual: string; motion: string; imageUrl?: string; clipUrl?: string; status: string; error?: string }
export interface Teaser {
  _id: string; scriptEpisodeId?: string; sceneNumber?: number; sceneHeading?: string; durationSeconds: number; tone: string; music: string; musicNotes?: string; voiceOver: boolean; voice: string; voiceLanguage: string; endLine?: string;
  sceneBible?: string; characters: { name: string; person?: string; look: string; refImageUrl?: string }[]; shots: TeaserShot[]; voiceOverScript: string; musicPrompt: string;
  status: string; step?: string; error?: string; hasVideo?: boolean; createdAt: string; aspect?: string; frameIds?: string[];
  result?: { hasVoiceOver?: boolean; hasMusic?: boolean; notes?: string[]; renderedAt?: string };
}

export interface CreditSummary {
  balance: number; held: number; available: number; monthlyCredits: number; markup: number; hardLimit: boolean; creditUsd: number; usedThisMonth: number;
  byFeature: { feature: string; label: string; credits: number; costUsd: number; calls: number }[];
  byModel: { provider: string; model?: string; credits: number; costUsd: number; calls: number; inputTokens?: number; outputTokens?: number; cacheReadTokens?: number }[];
  quotes: Record<string, number>;
}
export interface UsageEvent {
  _id: string; createdAt: string; userName?: string; feature: string; action?: string; provider: string; model?: string;
  inputTokens?: number; outputTokens?: number; cacheReadTokens?: number; cacheCreationTokens?: number; unit?: string; quantity?: number; costUsd: number; credits: number; latencyMs?: number;
}
export interface Availability { start: string; end: string; kind: 'booked' | 'hold' | 'unavailable'; note?: string }
export interface Actor {
  _id: string; name: string; character?: string; roleType: string; agent?: string; phone?: string; email?: string; dayRate?: number; currency?: string; notes?: string;
  availability: Availability[]; source: 'manual' | 'ai_sample' | 'import';
}
export interface PlaceResult { placeId: string; name: string; address?: string; lat?: number; lng?: number; mapsUri?: string; photoNames: string[]; types: string[]; rating?: number }
export interface ShootLocation extends Omit<PlaceResult, 'placeId'> {
  _id: string; placeId?: string; scriptName?: string; notes?: string; costPerDay?: number; permitDays?: number; currency?: string;
  costIsEstimate: boolean; estimateNote?: string; status: 'candidate' | 'locked';
}
export interface RunStep { key: string; label: string; status: 'pending' | 'running' | 'done' | 'failed' | 'waiting'; note?: string; error?: string }
export interface AiRun {
  _id: string; type: string; title?: string; status: 'queued' | 'running' | 'waiting' | 'done' | 'failed'; steps: RunStep[];
  waiting: { key: string; question: string; options?: string[] } | null; error?: string; createdAt: string; finishedAt?: string;
}
export interface BreakdownElement { category: string; name: string; qty?: number }
export interface SceneRow {
  _id: string; number: number; heading?: string; intExt?: string; location?: string; time?: string; eighths: number; characters: string[];
  synopsis?: string; elements: BreakdownElement[]; brokenDownAt?: string; locationId?: string;
}
export interface GroupedLocation extends ShootLocation {
  scriptNames: string[]; sceneNumbers: number[]; description?: string; palette: string[]; board: { label: string; imageUrl: string }[];
  logistics?: { contact?: string; power?: string; unitBase?: string; nearestHospital?: string; shootDays?: string };
}
export interface ProductionOverview {
  story: { _id: string; title: string; stats?: { scenes: number; pages: number } } | null; scenes: SceneRow[]; locations: GroupedLocation[];
  breakdownRun: { _id: string; status: string } | null; locationsRun: { _id: string; status: string } | null; shootDays: number | null;
}
export interface ShootDay { number: number; date: string; locationName: string; sceneIds: string[]; eighths: number; companyMove: boolean }
export interface PlanScene { id: string; number: number; location: string; time: string; eighths: number; cast: string[] }
export interface ScheduleView {
  schedule: {
    _id: string; startDate: string; daysOff: number[]; maxEighthsPerDay: number; days: ShootDay[]; status: 'draft' | 'approved'; approvedBy?: string; explanation?: string;
    conflicts: { day: number; actor: string; character: string; scene: number; kind: string; note?: string }[];
    stats: { days: number; companyMoves: number; holdingDays: number };
    itinerary: { day: number; time: string; title: string; detail: string }[];
  };
  scenes: PlanScene[];
  dood: {
    character: string; actor: string; codes: (string | null)[]; workDays: number; holdDays: number;
    role: string | null; blocks: { start: string; end: string; kind: string; note: string | null }[]; dateStatus: 'clear' | 'hold' | 'conflict';
  }[];
  today: number | null;
  timeline: { name: string; current: boolean; from: string | null; to: string | null; progress: number; shootDays?: number; shotDays?: number }[];
}

// ---- Direction ----
export interface FilmScene { episodeId: string; episodeNumber: number; sceneNumber: number; heading: string; location: string; time: string; characters: string[]; frames: Frame[] }
export interface FilmBoard {
  scenes: FilmScene[]; filters: { characters: string[]; locations: string[] };
  totals: { scenes: number; frames: number; rendered: number; keyFrames: number; scriptScenes: number | null };
}
export interface ShotRow { frameId: string; shot: string; label: string; size: string; lens: string; camera: string; cast: string[]; light: string; props: string; action: string; dialogue: string; setup: number; imageUrl: string | null; keyFrame?: boolean }
export interface ShotListView { scenes: { episodeNumber: number; sceneNumber: number; heading: string; setups: number; minutes: number; shots: ShotRow[] }[]; totals: { shots: number; setups: number; minutes: number } }
export interface LookBook {
  _id: string; title?: string; logline?: string; vision?: string; palette: { hex: string; name: string; use: string }[];
  sections: { key: string; title: string; body: string; imageUrls: string[] }[];
  characters: { name: string; look: string; imageUrl?: string }[]; locations: { name: string; mood: string; imageUrl?: string; palette: string[] }[];
  keyFrameIds: string[]; updatedAt: string;
}
export interface LookBookView { book: LookBook | null; run: { _id: string; status: string } | null; keyFrames: Pick<Frame, '_id' | 'sceneNumber' | 'order' | 'shot' | 'action' | 'imageUrl' | 'render'>[] }
export interface PitchSlide { kind: string; title: string; subtitle?: string; body?: string; bullets: string[]; imageUrl?: string; notes?: string }
export interface PitchDeck { _id: string; audience: string; title?: string; slides: PitchSlide[]; runId?: string; runStatus?: string | null; createdBy?: string; createdAt: string }
export interface FaceRow { _id: string; name: string; role?: string; lookImageUrl?: string; soulId?: string; locked?: boolean; casting?: { status: string; note?: string | null; error?: string | null } | null }

// ---- Money ----
export interface BudgetLineRow { department: string; item: string; qty: number; unit: string; low: number; high: number; source: 'rate_card' | 'actor' | 'location' | 'own'; note?: string }
export interface BudgetTotalsRow { aboveLine: { low: number; high: number }; belowLine: { low: number; high: number }; subtotal: { low: number; high: number }; contingency: { low: number; high: number }; total: { low: number; high: number; mid: number } }
export interface BudgetDoc {
  _id: string; productionId: string; currency: string; kind: 'estimate' | 'own'; contingencyPct: number; lines: BudgetLineRow[]; totals?: BudgetTotalsRow;
  quantities?: { shootDays: number; prepDays: number; postWeeks: number; episodes: number; runtimeMinutes: number; extraDays: number; companyMoves: number; vfxShots: number; stuntScenes: number; vehicleDays: number; cast: { character: string; actor?: string; role: string; days: number; dayRate?: number }[]; locations: { name: string; days: number; costPerDay?: number }[]; basis: string[] };
  fxRates: { code: string; rate: number }[]; adoptedAt?: string; adoptedBy?: string; runId?: string; runStatus?: string | null; createdAt: string;
}
export interface RateCardDoc { _id: string; currency: string; country?: string; estimate: boolean; lines: { department: string; item: string; basis: string; low: number; high: number; note?: string }[]; sources: string[] }
export interface EstimateView { production: { _id: string; title: string; currency: string; country?: string; totalBudget: number }; budgets: BudgetDoc[]; rateCard: RateCardDoc | null }
export interface CostRowView { department: string; aboveLine: boolean; budget: number; actual: number; pending: number; usedPct: number | null; estimateToComplete: number; estimateAtCompletion: number; variance: number }
export interface CostReportView {
  production: { _id: string; title: string; currency: string; totalBudget: number };
  budget: { _id: string; kind: string; adoptedAt?: string; contingencyPct: number; contingency: number; fxRates: { code: string; rate: number }[]; totals?: BudgetTotalsRow } | null;
  progress: { daysShot: number; shootDays: number }; rows: CostRowView[];
  totals: { budget: number; actual: number; pending: number; estimateToComplete: number; estimateAtCompletion: number; variance: number }; burnPerShootDay: number | null;
}

// ---- Post ----
export interface RushComment { _id: string; by?: string; text: string; seconds: number; at: string }
export interface RushRow { _id: string; episodeNumber?: number; sceneNumber: number; take: number; camera: string; clipName: string; shootDate?: string; durationSeconds?: number; fps: number; circled: boolean; url?: string; uploadPct: number; notes?: string; comments: RushComment[] }
export interface RushesView { rushes: RushRow[]; scenes: { episodeNumber: number | null; sceneNumber: number; takes: number; circled: number; uploadPct: number; comments: number }[] }
export interface EditVersionRow { _id: string; episodeNumber: number; stage: string; version: number; name?: string; url?: string; projectFile?: string; durationSeconds?: number; notes?: string; createdBy?: string; createdAt: string }
export interface PostTaskRow { _id: string; episodeNumber: number; stage: string; start?: string; due?: string; status: string; owner?: string; notes?: string; late?: boolean }

// ---- Tracking ----
export interface RiskFlagRow { level: 'red' | 'amber'; area: string; text: string }
export interface RiskNoteRow { _id: string; status: string; flags: RiskFlagRow[]; summary: string; actions: { action: string; who: string; area: string }[]; createdBy?: string; createdAt: string }
export interface FlowRow {
  id: string; title: string; format: string; projectStatus: string; column: string; stage: { order: number; of: number; name: string; flow: string };
  status: 'on_track' | 'needs_attention' | 'at_risk'; flags: RiskFlagRow[]; note: { summary: string; at: string } | null;
}
export interface FlowView { columns: string[]; rows: FlowRow[] }
export interface ProjectReport { _id: string; type: string; title?: string; content: string; createdBy?: string; createdAt: string }
export interface AuditRow { _id: string; action: string; by?: string; via: string; productionId?: string; production: string | null; targetId?: string; detail?: unknown; createdAt: string }
export interface AuditView { rows: AuditRow[]; actions: string[]; people: string[]; next: string | null }
