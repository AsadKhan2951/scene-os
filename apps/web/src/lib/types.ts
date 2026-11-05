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
export interface Story { _id: string; productionId?: string; title: string; format: string; language: string; answers: { question: string; answer: string }[]; oneLiner: string; locked: boolean; lockedAt?: string }
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
export interface Frame { _id: string; sceneNumber: number; order: number; shot?: string; action?: string; dialogue?: string; cast?: FrameCast[]; location?: string; light?: string; lens?: string; camera?: string; props?: string; imageUrl?: string; status: string; error?: string; redrawNote?: string; videoUrl?: string; videoStatus?: string; videoError?: string; filesPermanent?: boolean }
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
  status: string; step?: string; error?: string; hasVideo?: boolean; createdAt: string;
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
