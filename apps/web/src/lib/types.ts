import type { BoardStep, HealthResult, HealthSignals, Role } from '@sceneos/shared';

export interface Me { id: string; name: string; email: string; role: Role }
export interface Stage { order: number; name: string; phase: string; status: string; startedAt?: string; completedAt?: string; note?: string }
export interface Production {
  _id: string; title: string; format: string; genre?: string; writer?: string; director?: string; channel?: string;
  totalEpisodes: number; totalBudget: number; status: string; currentStage: number; stages: Stage[]; deliveryRequirements: string[];
}
export interface PortfolioRow {
  id: string; title: string; format: string; genre?: string; writer?: string; director?: string; channel?: string; status: string;
  totalEpisodes: number; currentStage: number; stageName: string;
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
export interface Character { _id: string; name: string; description?: string; ageRange?: string; familyGroup?: string; actorOptions: { name: string; note?: string }[]; finalCast: string | null }
export interface Frame { _id: string; sceneNumber: number; order: number; shot?: string; action?: string; dialogue?: string; imageUrl?: string; status: string; error?: string; redrawNote?: string; videoUrl?: string; videoStatus?: string; videoError?: string; filesPermanent?: boolean }
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
  characters: { name: string; look: string }[]; shots: TeaserShot[]; voiceOverScript: string; musicPrompt: string;
  status: string; step?: string; error?: string; hasVideo?: boolean; createdAt: string;
  result?: { hasVoiceOver?: boolean; hasMusic?: boolean; notes?: string[]; renderedAt?: string };
}
